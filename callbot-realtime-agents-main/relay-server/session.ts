import { WebSocket } from 'ws'
import { RealtimeSession } from '@openai/agents/realtime'
import { allAgentSets } from '../src/app/agentConfigs/index'
import { buildLeadgenMultiAgents, setLeadgenMultiAgentRuntimeContext, PromptOverrides } from '../src/app/agentConfigs/leadgenMultiAgent'
import { setLeadgenAgentV2RuntimeContext, injectLeadgenAgentV2Context, buildLeadgenAgentV2IntroText } from '../src/app/agentConfigs/leadgenAgentV2'
import { buildLeadgenMultiAgents as buildLeadgenDatAgents, setLeadgenMultiAgentRuntimeContext as setLeadgenDatRuntimeContext } from '../src/app/agentConfigs/leadgen_dat'
import { getLeadgenMultiAgentState } from '../src/app/agentConfigs/leadgenMultiAgent/internal/sessionState'
import { getLeadgenMultiAgentState as getLeadgenAgentV2State } from '../src/app/agentConfigs/leadgenAgentV2/internal/sessionState'
import { getLeadgenMultiAgentState as getLeadgenDatState } from '../src/app/agentConfigs/leadgen_dat/internal/sessionState'
import { AsrClient } from './asrClient'
import { streamTTSAudio, StreamingTTS } from '../src/app/lib/ttsClient'
import { CallHistoryMessage, CallHistoryPayload, sendCallHistory } from './kafka'
import { createCallTrace, flushTelemetry, fetchPrompt } from './telemetry'
import { classifyCallReport } from './callClassifier'

// Set DEBUG_LOGS=true to enable verbose history/transport event logs
const DEBUG_LOGS = process.env.DEBUG_LOGS === 'true'

function ts() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '')
}

function stripControlTags(text: string): string {
  return text
    .replace(/\|HANDOFF\/[^|]*/g, '')
    .replace(/\|(CHAT|FORWARD|ENDCALL)$/g, '')
    .replace(/\[ENDCALL\]/g, '')
    .replace(/\[TRANSFER:[^\]]*\]/g, '')
    .trim()
}

// When true, mic audio is NOT forwarded to ASR while TTS is playing.
// Set to false to allow barge-in / echo (useful for debugging).
const MUTE_DURING_PLAYBACK = true

// PCM16 8kHz mono: bytes → playback duration in ms
function pcmDurationMs(totalBytes: number): number {
  return (totalBytes / (8000 * 2)) * 1000
}

/** Normalize incoming audio to a Buffer copy. Handles Buffer, ArrayBuffer, Buffer[].
 *  Copying avoids ws library buffer reuse corruption that can cause distortion. */
function toAudioBuffer(data: Buffer | ArrayBuffer | Buffer[]): Buffer {
  if (Buffer.isBuffer(data)) {
    return Buffer.from(data)
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data)
  }
  return Buffer.from(data as ArrayBuffer)
}

function extractControlCommand(text: string): { action: string; ext?: string } | null {
  if (/\|ENDCALL\b/.test(text) || /\[ENDCALL\]/.test(text)) return { action: 'endcall' }
  if (/\|FORWARD\b/.test(text)) return { action: 'transfer' }
  const m = text.match(/\[TRANSFER:([^\]]+)\]/)
  if (m) return { action: 'transfer', ext: m[1] }
  return null
}

export class CallSession {
  private realtimeSession: RealtimeSession | null = null
  private asrClient: AsrClient | null = null
  private playbackMuteTimer: ReturnType<typeof setTimeout> | null = null
  private isPlayingAudio = false
  // True while OpenAI is generating a response. ASR transcripts are suppressed
  // during this window so they don't cancel an in-progress response.
  private isProcessing = false
  private pendingEndcall = false
  private botSpokenOnce = false
  private endcallFallbackTimer: ReturnType<typeof setTimeout> | null = null
  private history: CallHistoryMessage[] = []
  private turnId = 0
  private startTime = new Date()
  private endTime: Date | null = null
  private closed = false
  private firstPlaybackStopped = false
  private sipUuid = ''
  private trace: any = null
  private llmGenStartTime: Date | null = null
  private sendMessageTime: Date | null = null
  private llmFirstTokenTime: Date | null = null
  // Sticky per-turn: capture the FIRST response.created / response.text.delta
  // after each sendMessage(). Not cleared by response.done so they remain
  // available when agent_end fires (which may be after multiple tool-call rounds).
  private turnLlmStartTime: Date | null = null
  private turnLlmFirstTokenTime: Date | null = null
  // Streaming TTS state
  private streamingTts: StreamingTTS | null = null
  private llmTextBuffer = ''
  private ttsConnectPromise: Promise<void> | null = null
  private ttsAudioPromise: Promise<void> | null = null
  private ttsStreamStartTime: Date | null = null
  private ttsConnectedTime: Date | null = null
  private ttsFirstSentenceTime: Date | null = null
  private ttsFirstChunkTime: Date | null = null
  private ttsTotalBytes = 0
  private ttsChunkIdx = 0

  constructor(
    private ws: WebSocket,
    private opts: {
      callId      : string
      scenario    : string
      phone       : string
      voiceId     : string
      customData  : Record<string, any>
      mediaParams : Record<string, any>
    }
  ) {}

  private get pfx() {
    return `${ts()} [${this.opts.callId || 'no-uuid'}]`
  }

  private log(msg: string) { console.log(`${this.pfx} ${msg}`) }
  private logDebug(msg: string) { if (DEBUG_LOGS) console.log(`${this.pfx} ${msg}`) }
  private logError(msg: string, ...args: any[]) { console.error(`${this.pfx} ${msg}`, ...args) }

  // Send a structured event to the test client
  private sendEvent(direction: 'client' | 'server', eventName: string, eventData: Record<string, any>) {
    if (this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'event', direction, eventName, eventData }))
  }

  async start() {
    this.startTime = new Date()
    this.trace = createCallTrace(this.opts.callId, this.opts.scenario, this.opts.phone)

    // Fetch prompts from Langfuse (no-op when disabled or on error → fallback to hardcoded)
    let promptOverrides: PromptOverrides | undefined
    if (this.opts.scenario === 'leadgenMultiAgent') {
      const [greetingPrompt, mainSalePrompt] = await Promise.all([
        fetchPrompt('leadgen-greetingAgent'),
        fetchPrompt('leadgen-mainSaleAgent'),
      ])
      if (greetingPrompt || mainSalePrompt) {
        promptOverrides = {
          greetingAgent: greetingPrompt ?? undefined,
          mainSaleAgent: mainSalePrompt ?? undefined,
        }
        this.log(`Loaded prompts from Langfuse: greeting=${!!greetingPrompt} mainSale=${!!mainSalePrompt}`)
      }
    }

    // Always build fresh agents per session to avoid SDK internal state reuse across calls
    let agents: any
    if (this.opts.scenario === 'leadgenMultiAgent') {
      agents = buildLeadgenMultiAgents(promptOverrides)
    } else if (this.opts.scenario === 'leadgen_dat') {
      agents = buildLeadgenDatAgents()
    } else {
      agents = allAgentSets[this.opts.scenario]
    }
    if (!agents?.length) {
      this.ws.send(JSON.stringify({ type: 'error', message: `Unknown scenario: ${this.opts.scenario}` }))
      this.ws.close()
      return
    }

    const cd = this.opts.customData ?? {}
    const mp = this.opts.mediaParams ?? {}

    // Inject per-session runtime context for leadgen scenarios
    const leadgenRuntimeCtx = {
      sessionId: String(cd.session_id ?? this.opts.callId ?? '').trim() || this.opts.callId,
      leadId:             cd.leadId ?? cd.lead_id,
      phoneNumber:        this.opts.phone,
      displayAgentName:   cd.display_agent_name,
      voiceId:            this.opts.voiceId || cd.voice_id,
      overrideGender:     cd.gender,
      overrideName:       cd.name,
      overridePlate:      cd.plate,
      overrideVehicleType: cd.vehicle_type,
      overrideNumSeats:   cd.num_seats != null ? Number(cd.num_seats) : undefined,
      overrideIsBusiness: cd.is_business != null ? (cd.is_business === true || cd.is_business === 'true') : undefined,
      overrideWeightTons: cd.weight_tons != null ? Number(cd.weight_tons) : undefined,
      overrideExpiryDate: cd.expiry_date,
      overrideAddress:    cd.address,
      overrideBrand:      cd.brand,
      overrideColor:      cd.color,
    }
    if (this.opts.scenario === 'leadgenMultiAgent') {
      setLeadgenMultiAgentRuntimeContext(leadgenRuntimeCtx)
    } else if (this.opts.scenario === 'leadgenAgentV2') {
      setLeadgenAgentV2RuntimeContext(leadgenRuntimeCtx)
      injectLeadgenAgentV2Context(agents, leadgenRuntimeCtx.sessionId)
    } else if (this.opts.scenario === 'leadgen_dat') {
      setLeadgenDatRuntimeContext(leadgenRuntimeCtx)
    }

    // 1. Create OpenAI Realtime session.
    //    We use text-only input (ASR → text → OpenAI) so turn_detection and
    //    input_audio_transcription are disabled via providerData to avoid
    //    model errors (semantic_vad and gpt-4o-mini-transcribe are not
    //    supported by all realtime models). Audio output drives external TTS.
    this.realtimeSession = new RealtimeSession(agents[0], {
      transport: 'websocket',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini-realtime-preview',
      config: {
        modalities: ['text'],
        // Override SDK defaults that cause status=failed on gpt-4o-mini-realtime-preview.
        // providerData is spread last so it overrides the computed defaults.
        providerData: {
          turn_detection: null,
          input_audio_transcription: null,
        },
      },
      context: { phone: this.opts.phone, leadId: cd.leadId ?? cd.lead_id, callId: this.opts.callId, customData: cd },
    })

    // 3. Handle session-level errors so they don't crash the process
    this.realtimeSession.on('error', (err: any) => {
      this.logError('error:', err)
      this.ws.send(JSON.stringify({ type: 'error', message: String(err?.message ?? err) }))
    })

    // 4. Forward SDK events to client — verbose events gated by DEBUG_LOGS
    this.realtimeSession.on('history_added', (item: any) => {
      let eventName = item?.type ?? 'history_added'
      if (item?.type === 'message') eventName = `${item.role}.${item.status ?? 'added'}`
      if (item?.type === 'function_call') eventName = `function.${item.name}.${item.status ?? 'added'}`
      this.logDebug(`history_added event=${eventName}`)
      this.sendEvent('server', eventName, item)
    })

    this.realtimeSession.on('history_updated', (items: any[]) => {
      for (const item of items) {
        let eventName = item?.type ?? 'history_updated'
        if (item?.type === 'message') eventName = `${item.role}.${item.status ?? 'updated'}`
        if (item?.type === 'function_call') eventName = `function.${item.name}.${item.status ?? 'updated'}`
        this.logDebug(`history_updated event=${eventName}`)
        this.sendEvent('server', eventName, item)
      }
    })

    this.realtimeSession.on('agent_tool_start', (ctx: any, agent: any, functionCall: any) => {
      const history: any[] = ctx?.context?.history ?? []
      const call = [...history].reverse().find((c: any) => c?.type === 'function_call' && c?.name === functionCall?.name)
      const name = call?.name ?? functionCall?.name
      this.log(`tool_start tool=${name}`)
      this.sendEvent('client', 'tool_start', {
        name,
        args: call?.arguments ?? functionCall?.arguments,
      })
    })

    this.realtimeSession.on('agent_tool_end', (ctx: any, agent: any, functionCall: any, result: any) => {
      const history: any[] = ctx?.context?.history ?? []
      const call = [...history].reverse().find((c: any) => c?.type === 'function_call' && c?.name === functionCall?.name)
      const name = call?.name ?? functionCall?.name
      this.log(`tool_end tool=${name}`)
      this.sendEvent('client', 'tool_end', {
        name,
        result: typeof result === 'string' ? tryParseJson(result) : result,
      })
    })

    this.realtimeSession.on('agent_handoff', (_ctx: any, _from: any, toAgent: any) => {
      const agentName = toAgent?.name ?? 'unknown'
      this.log(`handoff → ${agentName}`)
      this.sendEvent('server', 'agent_handoff', { agentName })
    })

    this.realtimeSession.on('transport_event', (event: any) => {
      // Skip raw audio delta events — too noisy
      if (event?.type === 'response.audio.delta' || event?.type === 'input_audio_buffer.append') return
      // Track response lifecycle to block ASR transcripts during generation
      if (event?.type === 'response.created') {
        this.isProcessing = true
        this.llmGenStartTime = new Date()
        this.llmFirstTokenTime = null
        if (!this.turnLlmStartTime) this.turnLlmStartTime = this.llmGenStartTime
        this.logDebug('response.created → isProcessing=true')
      } else if (event?.type === 'response.text.delta') {
        if (!this.llmFirstTokenTime) {
          this.llmFirstTokenTime = new Date()
          if (!this.turnLlmFirstTokenTime) this.turnLlmFirstTokenTime = this.llmFirstTokenTime
          this.log(`response.text.delta FIRST TOKEN (turnLlmFirstTokenTime set)`)
        }
        const delta = event?.delta ?? ''
        if (delta) this.feedLlmToken(delta)
      } else if (event?.type === 'response.done') {
        this.isProcessing = false
        const r = event?.response ?? {}
        const tokens = `in=${r.usage?.input_tokens ?? 0} out=${r.usage?.output_tokens ?? 0}`
        this.logDebug(`response.done status=${r.status} ${tokens}`)
        if (this.trace && this.llmGenStartTime) {
          const endTime = new Date()
          const ttft = this.llmFirstTokenTime
            ? this.llmFirstTokenTime.getTime() - this.llmGenStartTime.getTime()
            : null
          const gen = this.trace.generation({
            name: 'llm-turn',
            model: r.model ?? process.env.OPENAI_MODEL,
            startTime: this.llmGenStartTime,
            usage: { input: r.usage?.input_tokens ?? 0, output: r.usage?.output_tokens ?? 0 },
            metadata: { ttftMs: ttft },
          })
          gen.end({ endTime })
          this.llmGenStartTime = null
        }
      } else if (event?.type === 'error') {
        this.logError(`transport error`, JSON.stringify(event).substring(0, 500))
      } else {
        this.logDebug(`transport_event type=${event?.type ?? 'unknown'}`)
      }
      this.sendEvent('server', event?.type ?? 'transport_event', event)
    })

    // 5. Agent text response → TTS → send audio to client
    this.realtimeSession.on('agent_end', async (_ctx: any, _agent: any, rawText: string) => {
      const text = stripControlTags(rawText)
      const cmd  = extractControlCommand(rawText)

      this.log(`BOT: "${rawText.substring(0, 300)}"`)  // rawText includes control tags
      this.log(`agent_end state: streamingTts=${!!this.streamingTts} turnLlmFirstTokenTime=${!!this.turnLlmFirstTokenTime} llmTextBuffer=${this.llmTextBuffer.length}chars`)
      this.botSpokenOnce = true
      this.sendEvent('server', 'agent_end', { rawText, text })

      if (text.trim()) {
        this.addAssistantMessage(text, rawText)
        this.sendEvent('client', 'tts_start', { text })

        if (this.streamingTts) {
          // ── Streaming TTS path: text was already being fed during LLM generation ──
          try {
            // Wait for TTS WS connection if still in progress
            if (this.ttsConnectPromise) await this.ttsConnectPromise
            if (!this.streamingTts) throw new Error('Streaming TTS connection failed')

            // Flush remaining buffer (strip control tags from leftovers)
            const remaining = stripControlTags(this.llmTextBuffer).trim()
            if (remaining) {
              if (!this.ttsFirstSentenceTime) this.ttsFirstSentenceTime = new Date()
              this.streamingTts.sendText(remaining)
            }
            this.llmTextBuffer = ''
            this.streamingTts.finish()

            // Wait for all audio chunks to be consumed
            await this.ttsAudioPromise

            const ttsElapsed = this.ttsStreamStartTime ? Date.now() - this.ttsStreamStartTime.getTime() : 0
            const pipelineMs = (this.ttsFirstChunkTime && this.sendMessageTime)
              ? this.ttsFirstChunkTime.getTime() - this.sendMessageTime.getTime() : null
            const ttsVoice = this.opts.voiceId || 'default'

            // Granular latency breakdown
            const asrToLlmMs = (this.turnLlmStartTime && this.sendMessageTime)
              ? this.turnLlmStartTime.getTime() - this.sendMessageTime.getTime() : null
            const llmTtftMs = (this.turnLlmFirstTokenTime && this.turnLlmStartTime)
              ? this.turnLlmFirstTokenTime.getTime() - this.turnLlmStartTime.getTime() : null
            const firstSentenceMs = (this.ttsFirstSentenceTime && this.ttsStreamStartTime)
              ? this.ttsFirstSentenceTime.getTime() - this.ttsStreamStartTime.getTime() : null
            const ttsLatencyMs = (this.ttsFirstChunkTime && this.ttsFirstSentenceTime)
              ? this.ttsFirstChunkTime.getTime() - this.ttsFirstSentenceTime.getTime() : null
            const ttsConnectMs = (this.ttsConnectedTime && this.ttsStreamStartTime)
              ? this.ttsConnectedTime.getTime() - this.ttsStreamStartTime.getTime() : null

            this.log(`TTS done (streaming) chunks=${this.ttsChunkIdx} bytes=${this.ttsTotalBytes} elapsed=${ttsElapsed}ms pipeline=${pipelineMs ?? '?'}ms voice=${ttsVoice} | asrToLlm=${asrToLlmMs ?? '?'}ms llmTtft=${llmTtftMs ?? '?'}ms firstSentence=${firstSentenceMs ?? '?'}ms ttsLatency=${ttsLatencyMs ?? '?'}ms ttsConnect=${ttsConnectMs ?? '?'}ms`)

            const ttsSpan = this.trace?.span({ name: 'tts', startTime: this.ttsStreamStartTime!, input: text })
            ttsSpan?.end({ endTime: new Date(), output: { totalBytes: this.ttsTotalBytes, elapsedMs: ttsElapsed, ttsConnectMs, voice: ttsVoice, streaming: true } })

            if (this.trace && this.sendMessageTime && this.ttsFirstChunkTime) {
              this.trace.span({
                name: 'pipeline-latency',
                startTime: this.sendMessageTime,
                endTime: this.ttsFirstChunkTime,
                output: {
                  totalPipelineMs: pipelineMs,
                  asrToLlmMs,
                  llmTtftMs,
                  firstSentenceMs,
                  ttsLatencyMs,
                  ttsConnectMs,
                },
              }).end({})
            }

            this.sendMessageTime = null
            this.sendEvent('client', 'tts_done', { totalBytes: this.ttsTotalBytes })
            const silenceBytes = (8000 * 2 * 100) / 1000
            if (this.ws.readyState === WebSocket.OPEN) this.ws.send(Buffer.alloc(silenceBytes, 0))
          } catch (err: any) {
            this.logError('TTS streaming error:', err)
            this.sendEvent('client', 'tts_error', { message: String(err?.message ?? err) })
          } finally {
            this.resetStreamingTtsState()
          }
        } else {
          // ── Fallback: non-streaming TTS (e.g. streaming connect failed) ──
          const ttsStartTime = new Date()
          const ttsSpan = this.trace?.span({ name: 'tts', startTime: ttsStartTime, input: text })
          try {
            let totalBytes = 0
            let chunkIdx = 0
            let firstChunkTime: Date | null = null
            const streamStart = Date.now()
            const ttsVoice = this.opts.voiceId || undefined
            const ttsTempo = mp.tts_tempo != null ? Number(mp.tts_tempo) : undefined
            for await (const chunk of streamTTSAudio(text, { resampleRate: 8000, voiceId: ttsVoice, tempo: ttsTempo })) {
              chunkIdx++
              if (chunkIdx === 1) firstChunkTime = new Date()
              totalBytes += chunk.length
              if (MUTE_DURING_PLAYBACK) {
                const elapsed = Date.now() - streamStart
                const remaining = Math.max(pcmDurationMs(totalBytes) - elapsed + 300, 300)
                this.setPlaybackMute(remaining)
              }
              if (this.ws.readyState === WebSocket.OPEN) this.ws.send(chunk)
            }
            const ttsElapsed = Date.now() - streamStart
            const ttfc = firstChunkTime ? firstChunkTime.getTime() - ttsStartTime.getTime() : null
            const pipelineMs = (firstChunkTime && this.sendMessageTime)
              ? firstChunkTime.getTime() - this.sendMessageTime.getTime() : null
            this.log(`TTS done chunks=${chunkIdx} bytes=${totalBytes} elapsed=${ttsElapsed}ms ttfc=${ttfc ?? '?'}ms pipeline=${pipelineMs ?? '?'}ms voice=${ttsVoice ?? 'default'}`)
            ttsSpan?.end({ endTime: new Date(), output: { totalBytes, elapsedMs: ttsElapsed, ttfcMs: ttfc, voice: ttsVoice ?? 'default' } })
            if (this.trace && this.sendMessageTime && firstChunkTime) {
              const asrToLlmMs = this.turnLlmStartTime
                ? this.turnLlmStartTime.getTime() - this.sendMessageTime.getTime() : null
              const llmTtftMs = (this.turnLlmFirstTokenTime && this.turnLlmStartTime)
                ? this.turnLlmFirstTokenTime.getTime() - this.turnLlmStartTime.getTime() : null
              this.trace.span({
                name: 'pipeline-latency',
                startTime: this.sendMessageTime,
                endTime: firstChunkTime,
                output: { totalPipelineMs: pipelineMs, asrToLlmMs, llmTtftMs, ttfcMs: ttfc },
              }).end({})
            }
            this.sendMessageTime = null
            this.sendEvent('client', 'tts_done', { totalBytes })
            const silenceBytes = (8000 * 2 * 100) / 1000
            if (this.ws.readyState === WebSocket.OPEN) this.ws.send(Buffer.alloc(silenceBytes, 0))
          } catch (err: any) {
            this.logError('TTS error:', err)
            ttsSpan?.end({ endTime: new Date(), level: 'ERROR', statusMessage: String(err?.message ?? err) })
            this.sendEvent('client', 'tts_error', { message: String(err?.message ?? err) })
          }
        }
      } else {
        // No text to speak — clean up any streaming state from tool-call-only response
        this.log(`agent_end NO TEXT — resetting streaming state (had streamingTts=${!!this.streamingTts})`)
        this.resetStreamingTtsState()
      }

      if (cmd) {
        this.log(`command action=${cmd.action} ext=${cmd.ext ?? ''}`)
        this.ws.send(JSON.stringify({ type: 'command', ...cmd }))
        if (cmd.action === 'endcall') {
          // Defer cleanup until we receive playback_stop from the bridge,
          // so the last TTS audio finishes playing before we tear down.
          this.pendingEndcall = true
          this.endcallFallbackTimer = setTimeout(() => {
            this.log('endcall fallback timeout (60s), cleaning up')
            void this.cleanup()
          }, 60_000)
        }
      }
    })

    await this.realtimeSession.connect({ apiKey: process.env.OPENAI_API_KEY! })

    // Patch transport to force modalities=['text'] on every outgoing event.
    // After agent handoff the SDK may reset modalities to ['text','audio'],
    // causing the model to generate audio (slow + unnecessary). This intercept
    // ensures ALL session.update and response.create stay text-only.
    const transport = this.realtimeSession.transport as any
    if (transport && typeof transport.sendEvent === 'function') {
      const origSend = transport.sendEvent.bind(transport)
      transport.sendEvent = (event: any) => {
        if (event?.type === 'session.update' && event?.session) {
          event.session.modalities = ['text']
          event.session.turn_detection = null
          event.session.input_audio_transcription = null
        }
        if (event?.type === 'response.create' && event?.response) {
          event.response.modalities = ['text']
        }
        return origSend(event)
      }
      this.log('transport patched: force modalities=["text"]')
    }

    // 6. Connect ASR client; on transcript → forward event + feed isFinal to agent
    const asrParams = {
      speechTimeout: mp.asr_speech_timeout != null ? String(mp.asr_speech_timeout) : undefined,
      silenceTimeout: mp.asr_silence_timeout != null ? String(mp.asr_silence_timeout) : undefined,
      speechMax: mp.asr_speech_max != null ? String(mp.asr_speech_max) : undefined,
    }
    this.asrClient = new AsrClient(process.env.ASR_PROXY_URL ?? 'ws://localhost:8082')
    await this.asrClient.connect(asrParams)
    this.asrClient.onTranscript((transcript, isFinal) => {
      this.sendEvent('client', 'asr_transcript', { transcript, isFinal })
      // Discard until bot has spoken AND first TTS playback confirmed done.
      // After first playback_stop, ASR stream is restarted to flush pre-TTS audio.
      if (!this.botSpokenOnce) return
      if (!this.firstPlaybackStopped) return
      if (isFinal) {
        const text = (transcript ?? '').trim() || '<silence>'
        if (this.isProcessing || this.isPlayingAudio) {
          this.log(`ASR suppressed (processing=${this.isProcessing} playing=${this.isPlayingAudio}): "${text.substring(0, 80)}"`)
          return
        }
        this.log(`USER: "${text.substring(0, 200)}"`)
        this.trace?.span({ name: 'asr', input: text }).end({ output: text })
        this.addUserMessage(text, transcript ?? '')
        this.isProcessing = true
        this.sendMessageTime = new Date()
        this.turnLlmStartTime = null
        this.turnLlmFirstTokenTime = null
        this.realtimeSession?.sendMessage(text)
        this.sendEvent('client', 'send_message', { text })
      }
    })

    this.ws.send(JSON.stringify({ type: 'ready' }))

    // 7. Bridge will send {"type":"go"} when the call is actually answered.
    //    response.create is deferred until then so the bot speaks only after
    //    the partner picks up (avoids 4s silence timeout on partner PBX).

    // 8. Incoming binary audio → forward to ASR proxy (skip while muted during playback)
    let audioChunksReceived = 0
    this.ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (isBinary) {
        audioChunksReceived++
        if (audioChunksReceived === 1) {
          this.log(`first audio chunk received callId=${this.opts.callId}`)
        }
        // Normalize to Buffer copy to avoid ws buffer reuse / type mismatch distortion
        const chunk = toAudioBuffer(data)
        if (MUTE_DURING_PLAYBACK && this.isPlayingAudio) return
        this.asrClient?.sendAudio(chunk)
      } else {
        try {
          const msg = JSON.parse((data as Buffer).toString())
          if (msg.type === 'set_sip_uuid') {
            this.sipUuid = msg.message ?? ''
            this.log(`set_sip_uuid=${this.sipUuid}`)
          }
          if (msg.type === 'go') {
            // Call has been answered — trigger the bot's opening message
            if (this.opts.scenario === 'leadgenAgentV2') {
              // Skip LLM for the first turn: build intro_text from template
              // and send directly to TTS, saving 2 LLM round-trips.
              void this.sendDirectIntro()
            } else {
              this.log('received go → response.create')
              this.isProcessing = true
              this.realtimeSession?.transport.sendEvent({
                type: 'response.create',
                response: {
                  modalities: ['text'],
                },
              } as any)
            }
          }
          if (msg.type === 'interrupt') {
            this.realtimeSession?.interrupt()
            this.sendEvent('client', 'interrupt', {})
          }
          if (msg.type === 'hangup') void this.cleanup()
          if (msg.type === 'event' && msg.eventName === 'playback_stop') {
            // Bridge confirmed FreeSWITCH finished playing — cancel the timer-based unmute
            // and re-enable ASR immediately at the correct moment.
            if (this.playbackMuteTimer) {
              clearTimeout(this.playbackMuteTimer)
              this.playbackMuteTimer = null
            }
            this.isPlayingAudio = false
            // After first TTS playback confirmed done: restart ASR to flush any
            // audio that was spoken before the bot's opening line (e.g. "alo").
            if (!this.firstPlaybackStopped && this.botSpokenOnce) {
              this.firstPlaybackStopped = true
              this.log('first playback_stop → restarting ASR to flush pre-TTS audio')
              this.asrClient?.restartStream(asrParams).catch((e) =>
                this.logError('ASR restart failed:', e)
              )
            }
            this.sendEvent('client', 'asr_unmuted', {})
            // If we were waiting for the last TTS to finish before hanging up, do it now.
            if (this.pendingEndcall) {
              if (this.endcallFallbackTimer) {
                clearTimeout(this.endcallFallbackTimer)
                this.endcallFallbackTimer = null
              }
              this.pendingEndcall = false
              void this.cleanup()
            }
          }
        } catch {}
      }
    })

    this.ws.on('close', () => { void this.cleanup() })
    this.ws.on('error', () => { void this.cleanup() })
  }

  // ── Streaming TTS helpers ──

  private feedLlmToken(token: string): void {
    this.llmTextBuffer += token

    if (!this.streamingTts) {
      this.initStreamingTts()
      return // will flush buffer once connected
    }

    this.flushLlmBuffer()
  }

  private initStreamingTts(): void {
    this.ttsStreamStartTime = new Date()
    this.ttsConnectedTime = null
    this.ttsFirstSentenceTime = null
    this.ttsFirstChunkTime = null
    this.ttsTotalBytes = 0
    this.ttsChunkIdx = 0

    const ttsVoice = this.opts.voiceId || undefined
    const mp = this.opts.mediaParams ?? {}
    const ttsTempo = mp.tts_tempo != null ? Number(mp.tts_tempo) : undefined
    const tts = new StreamingTTS({ resampleRate: 8000, voiceId: ttsVoice, tempo: ttsTempo })
    this.streamingTts = tts

    this.ttsConnectPromise = tts.connect().then(() => {
      this.ttsConnectedTime = new Date()
      this.log('Streaming TTS connected, starting audio loop')
      this.startTtsAudioLoop()
      this.flushLlmBuffer()
    }).catch((err) => {
      this.logError('Streaming TTS connect failed:', err)
      this.streamingTts = null
    })
  }

  private flushLlmBuffer(): void {
    if (!this.streamingTts) return
    let chunk: string | null
    while ((chunk = this.extractSentenceChunk()) !== null) {
      if (!this.ttsFirstSentenceTime) this.ttsFirstSentenceTime = new Date()
      this.streamingTts.sendText(chunk)
    }
  }

  /**
   * Extract a complete sentence from the LLM text buffer.
   * Uses punctuation + whitespace as boundary to avoid splitting numbers like "480.700".
   */
  private extractSentenceChunk(): string | null {
    // Sentence boundary: punctuation followed by whitespace
    const match = this.llmTextBuffer.match(/^([\s\S]*?[.?!;]\s)/)
    if (match && match[1].trim().length >= 5) {
      const chunk = match[1]
      this.llmTextBuffer = this.llmTextBuffer.substring(chunk.length)
      return chunk.trim()
    }
    // Newline boundary
    const nlIdx = this.llmTextBuffer.indexOf('\n')
    if (nlIdx >= 5) {
      const chunk = this.llmTextBuffer.substring(0, nlIdx + 1)
      this.llmTextBuffer = this.llmTextBuffer.substring(nlIdx + 1)
      return chunk.trim() || null
    }
    // Comma flush for long buffers (>150 chars)
    if (this.llmTextBuffer.length > 150) {
      const match2 = this.llmTextBuffer.match(/^([\s\S]*?,\s)/)
      if (match2 && match2[1].length >= 20) {
        const chunk = match2[1]
        this.llmTextBuffer = this.llmTextBuffer.substring(chunk.length)
        return chunk.trim()
      }
    }
    return null
  }

  private startTtsAudioLoop(): void {
    if (!this.streamingTts) return
    const streamStart = Date.now()
    this.ttsAudioPromise = (async () => {
      try {
        for await (const chunk of this.streamingTts!.audioChunks()) {
          this.ttsChunkIdx++
          if (this.ttsChunkIdx === 1) this.ttsFirstChunkTime = new Date()
          this.ttsTotalBytes += chunk.length
          if (MUTE_DURING_PLAYBACK) {
            const elapsed = Date.now() - streamStart
            const remaining = Math.max(pcmDurationMs(this.ttsTotalBytes) - elapsed + 300, 300)
            this.setPlaybackMute(remaining)
          }
          if (this.ws.readyState === WebSocket.OPEN) this.ws.send(chunk)
        }
      } catch (err: any) {
        this.logError('TTS streaming audio loop error:', err)
      }
    })()
  }

  private resetStreamingTtsState(): void {
    if (this.streamingTts) {
      this.streamingTts.close()
      this.streamingTts = null
    }
    this.ttsConnectPromise = null
    this.ttsAudioPromise = null
    this.ttsStreamStartTime = null
    this.ttsConnectedTime = null
    this.ttsFirstSentenceTime = null
    this.ttsFirstChunkTime = null
    this.ttsTotalBytes = 0
    this.ttsChunkIdx = 0
    this.llmTextBuffer = ''
  }

  /**
   * Send the scripted intro_text directly to TTS without going through the LLM.
   * Also injects the text as an assistant message into the OpenAI conversation
   * so the LLM has context of what was said when it handles subsequent turns.
   */
  private async sendDirectIntro() {
    try {
      const sessionId = String(this.opts.customData?.session_id ?? this.opts.callId ?? '').trim() || this.opts.callId
      const state = getLeadgenAgentV2State(sessionId)
      const introText = buildLeadgenAgentV2IntroText(sessionId, state)

      if (!introText.trim()) {
        this.log('sendDirectIntro: empty intro_text, falling back to response.create')
        this.isProcessing = true
        this.realtimeSession?.transport.sendEvent({
          type: 'response.create',
          response: { modalities: ['text'] },
        } as any)
        return
      }

      this.log(`sendDirectIntro: "${introText.substring(0, 200)}"`)
      this.isProcessing = true

      // 1. Inject as assistant message in OpenAI conversation history
      //    so the LLM knows what was already said on subsequent turns.
      this.realtimeSession?.transport.sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: `${introText}|CHAT` }],
        },
      } as any)

      // 2. Record in call history
      this.addAssistantMessage(introText, `${introText}|CHAT`)
      this.botSpokenOnce = true
      this.sendEvent('server', 'agent_end', { rawText: `${introText}|CHAT`, text: introText })

      // 3. Send directly to TTS
      this.sendEvent('client', 'tts_start', { text: introText })
      const mp = this.opts.mediaParams ?? {}
      const ttsStartTime = new Date()
      const ttsSpan = this.trace?.span({ name: 'tts', startTime: ttsStartTime, input: introText })
      let totalBytes = 0
      let chunkIdx = 0
      let firstChunkTime: Date | null = null
      const streamStart = Date.now()
      const ttsVoice = this.opts.voiceId || undefined
      const ttsTempo = mp.tts_tempo != null ? Number(mp.tts_tempo) : undefined
      for await (const chunk of streamTTSAudio(introText, { resampleRate: 8000, voiceId: ttsVoice, tempo: ttsTempo })) {
        chunkIdx++
        if (chunkIdx === 1) firstChunkTime = new Date()
        totalBytes += chunk.length
        if (MUTE_DURING_PLAYBACK) {
          const elapsed = Date.now() - streamStart
          const remaining = Math.max(pcmDurationMs(totalBytes) - elapsed + 300, 300)
          this.setPlaybackMute(remaining)
        }
        if (this.ws.readyState === WebSocket.OPEN) this.ws.send(chunk)
      }
      const ttsElapsed = Date.now() - streamStart
      const ttfc = firstChunkTime ? firstChunkTime.getTime() - ttsStartTime.getTime() : null
      this.log(`sendDirectIntro TTS done chunks=${chunkIdx} bytes=${totalBytes} elapsed=${ttsElapsed}ms ttfc=${ttfc ?? '?'}ms voice=${ttsVoice ?? 'default'}`)
      ttsSpan?.end({ endTime: new Date(), output: { totalBytes, elapsedMs: ttsElapsed, ttfcMs: ttfc, voice: ttsVoice ?? 'default' } })
      this.sendEvent('client', 'tts_done', { totalBytes })
      const silenceBytes = (8000 * 2 * 100) / 1000
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(Buffer.alloc(silenceBytes, 0))

      this.isProcessing = false
    } catch (err: any) {
      this.logError('sendDirectIntro error:', err)
      // Fallback to LLM if direct intro fails
      this.isProcessing = true
      this.realtimeSession?.transport.sendEvent({
        type: 'response.create',
        response: { modalities: ['text'] },
      } as any)
    }
  }

  private setPlaybackMute(durationMs: number) {
    if (this.playbackMuteTimer) clearTimeout(this.playbackMuteTimer)
    this.isPlayingAudio = true
    this.sendEvent('client', 'asr_muted', { durationMs })
    this.playbackMuteTimer = setTimeout(() => {
      this.isPlayingAudio = false
      this.playbackMuteTimer = null
      this.sendEvent('client', 'asr_unmuted', {})
    }, durationMs)
  }

  private async cleanup() {
    if (this.closed) return
    this.closed = true
    if (!this.endTime) this.endTime = new Date()

    this.trace?.update({ endTime: this.endTime })

    // Post-call classify: use Chat API to classify call outcome from history.
    // Runs before flushHistory so report is included in the Kafka payload.
    let classifiedReport: Array<{ id: number; detail: string }> | undefined
    const leadgenScenarios = ['leadgenMultiAgent', 'leadgenAgentV2', 'leadgen_dat']
    if (leadgenScenarios.includes(this.opts.scenario) && this.history.length > 0) {
      try {
        this.log('post-call classify: requesting...')
        classifiedReport = await classifyCallReport(this.history)
        this.log(`post-call classify: result=${JSON.stringify(classifiedReport)}`)
      } catch (e) {
        this.logError('post-call classify failed:', e)
      }
    }

    await this.flushHistory(classifiedReport)
    await flushTelemetry()

    if (this.endcallFallbackTimer) {
      clearTimeout(this.endcallFallbackTimer)
      this.endcallFallbackTimer = null
    }
    if (this.playbackMuteTimer) clearTimeout(this.playbackMuteTimer)
    this.playbackMuteTimer = null
    this.isPlayingAudio = false
    this.resetStreamingTtsState()
    this.asrClient?.close()
    this.realtimeSession?.close()
    this.asrClient = null
    this.realtimeSession = null
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close()
  }

  private addAssistantMessage(content: string, originContent: string) {
    this.turnId += 1
    const msg: CallHistoryMessage = {
      role: 'assistant',
      content,
      origin_content: originContent,
      turn_id: this.turnId,
      timestamp: new Date().toISOString(),
    }
    this.history.push(msg)
  }

  private addUserMessage(content: string, originContent: string) {
    if (this.turnId === 0) {
      this.turnId = 1
    }
    const msg: CallHistoryMessage = {
      role: 'user',
      content,
      origin_content: originContent,
      turn_id: this.turnId,
      timestamp: new Date().toISOString(),
    }
    this.history.push(msg)
  }

  private async flushHistory(classifiedReport?: Array<{ id: number; detail: string }>) {
    const cd = this.opts.customData ?? {}
    const callId = this.opts.callId || this.opts.phone || cd.leadId || ''
    if (!callId || !this.history.length) return

    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    let report: any = undefined

    // Priority 1: classified report from Chat API (post-call classifier)
    if (classifiedReport && classifiedReport.length > 0) {
      report = classifiedReport.map((r) => ({ id: r.id, detail: r.detail, created_at: now }))
      this.log(`flushHistory: using classified report (${report.length} labels)`)
    }

    // Priority 2: outcome from in-memory sessionState (tool calls during conversation)
    if (!report) {
      const leadgenScenarios = ['leadgenMultiAgent', 'leadgenAgentV2', 'leadgen_dat']
      if (leadgenScenarios.includes(this.opts.scenario)) {
        try {
          const sessionId = String(cd.session_id ?? this.opts.callId ?? '').trim() || this.opts.callId
          const stateFn = this.opts.scenario === 'leadgenAgentV2' ? getLeadgenAgentV2State
            : this.opts.scenario === 'leadgen_dat' ? getLeadgenDatState
            : getLeadgenMultiAgentState
          const state = stateFn(sessionId)
          if (state?.outcome && Array.isArray(state.outcome.report) && state.outcome.report.length > 0) {
            const endedAt = (state.outcome.endedAt ?? now)
            report = state.outcome.report.map((r: any) => ({
              id: r.id,
              detail: r.detail,
              created_at: endedAt,
            }))
            this.log(`flushHistory: using state report (${report.length} labels)`)
          }
        } catch (e) {
          this.logError('Failed to get leadgen outcome:', e)
        }
      }
    }

    // Priority 3: legacy _report from realtimeSession context
    if (!report) {
      report = (this.realtimeSession as any)?.context?.context?._report ?? undefined
    }

    // Priority 4: fallback heuristic from last bot text
    if (!report || (Array.isArray(report) && report.length === 0)) {
      const lastBot = [...this.history].reverse().find(m => m.role === 'assistant')
      const lastText = (lastBot?.origin_content || lastBot?.content || '').toLowerCase()

      if (lastText.includes('bằng số cá nhân')) {
        report = [
          { id: 39, detail: 'Khách hàng tiềm năng', created_at: now },
          { id: 35, detail: 'Đồng ý/quan tâm', created_at: now },
        ]
      } else {
        report = [{ id: 43, detail: 'Không xác định', created_at: now }]
      }
      this.log(`flushHistory: using fallback report`)
    }

    const payload: CallHistoryPayload = {
      call_id: this.opts.callId || '',
      ...(this.sipUuid ? { recording_uuid: this.sipUuid } : {}),
      scenario: this.opts.scenario,
      phone: this.opts.phone,
      start_time: this.startTime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      answer_time: this.startTime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      end_time: (this.endTime || new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      history: this.history,
      customer_info: { ...cd },
      ...(report ? { report } : {}),
    }

    // Delay 2s to ensure FS has finished writing the recording file
    await new Promise(resolve => setTimeout(resolve, 2000))
    await sendCallHistory(callId, payload)
  }
}

function tryParseJson(val: string) {
  try { return JSON.parse(val) } catch { return val }
}
