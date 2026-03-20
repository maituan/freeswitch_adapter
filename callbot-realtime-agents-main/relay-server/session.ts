import { WebSocket } from 'ws'
import { RealtimeSession } from '@openai/agents/realtime'
import { allAgentSets } from '../src/app/agentConfigs/index'
import { buildLeadgenMultiAgents, setLeadgenMultiAgentRuntimeContext } from '../src/app/agentConfigs/leadgenMultiAgent'
import { AsrClient } from './asrClient'
import { streamTTSAudio } from '../src/app/lib/ttsClient'
import { CallHistoryMessage, CallHistoryPayload, sendCallHistory } from './kafka'
import { createCallTrace, flushTelemetry } from './telemetry'

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
  private trace: any = null
  private llmGenStartTime: Date | null = null
  private sendMessageTime: Date | null = null
  private llmFirstTokenTime: Date | null = null
  // Sticky per-turn: capture the FIRST response.created / response.text.delta
  // after each sendMessage(). Not cleared by response.done so they remain
  // available when agent_end fires (which may be after multiple tool-call rounds).
  private turnLlmStartTime: Date | null = null
  private turnLlmFirstTokenTime: Date | null = null

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

    // Always build fresh agents per session to avoid SDK internal state reuse across calls
    let agents = this.opts.scenario === 'leadgenMultiAgent'
      ? buildLeadgenMultiAgents()
      : allAgentSets[this.opts.scenario]
    if (!agents?.length) {
      this.ws.send(JSON.stringify({ type: 'error', message: `Unknown scenario: ${this.opts.scenario}` }))
      this.ws.close()
      return
    }

    const cd = this.opts.customData ?? {}
    const mp = this.opts.mediaParams ?? {}

    // Inject per-session runtime context for leadgenMultiAgent
    if (this.opts.scenario === 'leadgenMultiAgent') {
      const sessionId = String(cd.session_id ?? this.opts.callId ?? '').trim() || this.opts.callId
      setLeadgenMultiAgentRuntimeContext({
        sessionId,
        leadId:             cd.leadId ?? cd.lead_id,
        phoneNumber:        this.opts.phone,
        displayAgentName:   cd.display_agent_name,
        overrideGender:     cd.gender,
        overrideName:       cd.name,
        overridePlate:      cd.plate,
        overrideVehicleType: cd.vehicle_type,
        overrideNumSeats:   cd.num_seats != null ? Number(cd.num_seats) : undefined,
        overrideIsBusiness: cd.is_business != null ? Boolean(cd.is_business) : undefined,
        overrideWeightTons: cd.weight_tons != null ? Number(cd.weight_tons) : undefined,
        overrideExpiryDate: cd.expiry_date,
        overrideAddress:    cd.address,
        overrideBrand:      cd.brand,
        overrideColor:      cd.color,
      })
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
      } else if (event?.type === 'response.text.delta' && !this.llmFirstTokenTime) {
        this.llmFirstTokenTime = new Date()
        if (!this.turnLlmFirstTokenTime) this.turnLlmFirstTokenTime = this.llmFirstTokenTime
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
      this.botSpokenOnce = true
      this.sendEvent('server', 'agent_end', { rawText, text })

      if (text.trim()) {
        this.addAssistantMessage(text, rawText)
        this.sendEvent('client', 'tts_start', { text })
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
            ? firstChunkTime.getTime() - this.sendMessageTime.getTime()
            : null
          this.log(`TTS done chunks=${chunkIdx} bytes=${totalBytes} elapsed=${ttsElapsed}ms ttfc=${ttfc ?? '?'}ms pipeline=${pipelineMs ?? '?'}ms voice=${ttsVoice ?? 'default'}`)
          ttsSpan?.end({ endTime: new Date(), output: { totalBytes, elapsedMs: ttsElapsed, ttfcMs: ttfc, voice: ttsVoice ?? 'default' } })
          if (this.trace && this.sendMessageTime && firstChunkTime) {
            const asrToLlmMs = this.turnLlmStartTime
              ? this.turnLlmStartTime.getTime() - this.sendMessageTime.getTime()
              : null
            const llmTtftMs = (this.turnLlmFirstTokenTime && this.turnLlmStartTime)
              ? this.turnLlmFirstTokenTime.getTime() - this.turnLlmStartTime.getTime()
              : null
            this.trace.span({
              name: 'pipeline-latency',
              startTime: this.sendMessageTime,
              endTime: firstChunkTime,
              output: {
                totalPipelineMs: pipelineMs,
                asrToLlmMs,
                llmTtftMs,
                ttfcMs: ttfc,
              },
            }).end({})
          }
          this.sendMessageTime = null
          this.sendEvent('client', 'tts_done', { totalBytes })
          // 100ms silence flushes the last meaningful chunk through FreeSWITCH's buffer.
          const silenceBytes = (8000 * 2 * 100) / 1000
          if (this.ws.readyState === WebSocket.OPEN) this.ws.send(Buffer.alloc(silenceBytes, 0))
        } catch (err: any) {
          this.logError('TTS error:', err)
          ttsSpan?.end({ endTime: new Date(), level: 'ERROR', statusMessage: String(err?.message ?? err) })
          this.sendEvent('client', 'tts_error', { message: String(err?.message ?? err) })
        }
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
      if (!this.botSpokenOnce) return
      if (isFinal && transcript.trim()) {
        if (this.isProcessing || this.isPlayingAudio) {
          this.log(`ASR suppressed (processing=${this.isProcessing} playing=${this.isPlayingAudio}): "${transcript.trim().substring(0, 80)}"`)
          return
        }
        const text = transcript.trim()
        this.log(`USER: "${text.substring(0, 200)}"`)
        this.trace?.span({ name: 'asr', input: text }).end({ output: text })
        this.addUserMessage(text, transcript)
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
          if (msg.type === 'go') {
            // Call has been answered — trigger the bot's opening message
            this.log('received go → response.create')
            this.isProcessing = true
            this.realtimeSession?.transport.sendEvent({ type: 'response.create' } as any)
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
    await this.flushHistory()
    await flushTelemetry()

    if (this.endcallFallbackTimer) {
      clearTimeout(this.endcallFallbackTimer)
      this.endcallFallbackTimer = null
    }
    if (this.playbackMuteTimer) clearTimeout(this.playbackMuteTimer)
    this.playbackMuteTimer = null
    this.isPlayingAudio = false
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

  private async flushHistory() {
    const cd = this.opts.customData ?? {}
    const callId = this.opts.callId || this.opts.phone || cd.leadId || ''
    if (!callId || !this.history.length) return

    const report = (this.realtimeSession as any)?.context?.context?._report ?? undefined

    const payload: CallHistoryPayload = {
      call_id: this.opts.callId || '',
      scenario: this.opts.scenario,
      phone: this.opts.phone,
      start_time: this.startTime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      answer_time: this.startTime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      end_time: (this.endTime || new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      history: this.history,
      customer_info: { ...cd },
      ...(report ? { report } : {}),
    }

    await sendCallHistory(callId, payload)
  }
}

function tryParseJson(val: string) {
  try { return JSON.parse(val) } catch { return val }
}
