import { WebSocket } from 'ws'
import { RealtimeSession } from '@openai/agents/realtime'
import { allAgentSets } from '../src/app/agentConfigs/index'
import { AsrClient } from './asrClient'
import { streamTTSAudio } from '../src/app/lib/ttsClient'
import { CallHistoryMessage, CallHistoryPayload, sendCallHistory } from './kafka'

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
  private pendingEndcall = false
  private endcallFallbackTimer: ReturnType<typeof setTimeout> | null = null
  private history: CallHistoryMessage[] = []
  private turnId = 0
  private startTime = new Date()
  private endTime: Date | null = null
  private closed = false

  constructor(
    private ws: WebSocket,
    private opts: {
      callId     : string
      scenario   : string
      phone      : string
      voiceId    : string
      customData : Record<string, any>
    }
  ) {}

  // Send a structured event to the test client
  private sendEvent(direction: 'client' | 'server', eventName: string, eventData: Record<string, any>) {
    if (this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'event', direction, eventName, eventData }))
  }

  async start() {
    this.startTime = new Date()

    const agents = allAgentSets[this.opts.scenario]
    if (!agents?.length) {
      this.ws.send(JSON.stringify({ type: 'error', message: `Unknown scenario: ${this.opts.scenario}` }))
      this.ws.close()
      return
    }

    const cd = this.opts.customData ?? {}

    // 1. Create OpenAI Realtime session — text-only mode, no audio to OpenAI
    this.realtimeSession = new RealtimeSession(agents[0], {
      transport: 'websocket',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini-realtime-preview',
      config: {
        modalities: ['text'],
      },
      context: { phone: this.opts.phone, leadId: cd.leadId, customData: cd },
    })

    // 3. Handle session-level errors so they don't crash the process
    this.realtimeSession.on('error', (err: any) => {
      console.error('[Session] RealtimeSession error:', err)
      this.ws.send(JSON.stringify({ type: 'error', message: String(err?.message ?? err) }))
    })

    // 4. Forward SDK events to client (mirrors useHandleSessionHistory + useRealtimeSession)
    this.realtimeSession.on('history_added', (item: any) => {
      let eventName = item?.type ?? 'history_added'
      if (item?.type === 'message') eventName = `${item.role}.${item.status ?? 'added'}`
      if (item?.type === 'function_call') eventName = `function.${item.name}.${item.status ?? 'added'}`
      console.log(`[Session] history_added event=${eventName}`)
      this.sendEvent('server', eventName, item)
    })

    this.realtimeSession.on('history_updated', (items: any[]) => {
      for (const item of items) {
        let eventName = item?.type ?? 'history_updated'
        if (item?.type === 'message') eventName = `${item.role}.${item.status ?? 'updated'}`
        if (item?.type === 'function_call') eventName = `function.${item.name}.${item.status ?? 'updated'}`
        console.log(`[Session] history_updated event=${eventName}`)
        this.sendEvent('server', eventName, item)
      }
    })

    this.realtimeSession.on('agent_tool_start', (ctx: any, agent: any, functionCall: any) => {
      const history: any[] = ctx?.context?.history ?? []
      const call = [...history].reverse().find((c: any) => c?.type === 'function_call' && c?.name === functionCall?.name)
      const name = call?.name ?? functionCall?.name
      console.log(`[Session] agent_tool_start tool=${name}`)
      this.sendEvent('client', 'tool_start', {
        name,
        args: call?.arguments ?? functionCall?.arguments,
      })
    })

    this.realtimeSession.on('agent_tool_end', (ctx: any, agent: any, functionCall: any, result: any) => {
      const history: any[] = ctx?.context?.history ?? []
      const call = [...history].reverse().find((c: any) => c?.type === 'function_call' && c?.name === functionCall?.name)
      const name = call?.name ?? functionCall?.name
      console.log(`[Session] agent_tool_end tool=${name}`)
      this.sendEvent('client', 'tool_end', {
        name,
        result: typeof result === 'string' ? tryParseJson(result) : result,
      })
    })

    this.realtimeSession.on('agent_handoff', (item: any) => {
      const history: any[] = item?.context?.history ?? []
      const last = [...history].reverse().find((c: any) => c?.type === 'message' && c?.role === 'assistant')
      const agentName = last?.name?.split('transfer_to_')[1] ?? 'unknown'
      console.log(`[Session] agent_handoff to=${agentName}`)
      this.sendEvent('server', 'agent_handoff', { agentName })
    })

    this.realtimeSession.on('transport_event', (event: any) => {
      // Skip raw audio delta events — they're too noisy and binary
      if (event?.type === 'response.audio.delta' || event?.type === 'input_audio_buffer.append') return
      console.log(`[Session] transport_event type=${event?.type ?? 'unknown'}`)
      this.sendEvent('server', event?.type ?? 'transport_event', event)
    })

    // 5. Agent text response → TTS → send audio to client
    this.realtimeSession.on('agent_end', async (_ctx: any, _agent: any, rawText: string) => {
      const text = stripControlTags(rawText)
      const cmd  = extractControlCommand(rawText)

      console.log(`[Session] agent_end text="${text.substring(0, 80)}" cmd=${cmd?.action ?? 'none'}`)
      this.sendEvent('server', 'agent_end', { rawText, text })

      if (text.trim()) {
        this.addAssistantMessage(text, rawText)
        this.sendEvent('client', 'tts_start', { text })
        try {
          let totalBytes = 0
          let chunkIdx = 0
          const streamStart = Date.now()
          const ttsVoice = this.opts.voiceId || undefined
          for await (const chunk of streamTTSAudio(text, { resampleRate: 8000, voiceId: ttsVoice })) {
            chunkIdx++
            totalBytes += chunk.length
            console.log(`[Session] tts_chunk #${chunkIdx} size=${chunk.length} totalBytes=${totalBytes}`)
            if (MUTE_DURING_PLAYBACK) {
              const elapsed = Date.now() - streamStart
              const remaining = Math.max(pcmDurationMs(totalBytes) - elapsed + 300, 300)
              this.setPlaybackMute(remaining)
            }
            if (this.ws.readyState === WebSocket.OPEN) this.ws.send(chunk)
          }
          console.log(`[Session] tts_done chunks=${chunkIdx} totalBytes=${totalBytes} elapsed=${Date.now() - streamStart}ms`)
          this.sendEvent('client', 'tts_done', { totalBytes })
          // 100ms silence flushes the last meaningful chunk through FreeSWITCH's buffer.
          const silenceBytes = (8000 * 2 * 100) / 1000
          if (this.ws.readyState === WebSocket.OPEN) this.ws.send(Buffer.alloc(silenceBytes, 0))
        } catch (err: any) {
          console.error('[Session] TTS error:', err)
          this.sendEvent('client', 'tts_error', { message: String(err?.message ?? err) })
        }
      }

      if (cmd) {
        console.log(`[Session] sending command action=${cmd.action} ext=${cmd.ext ?? ''}`)
        this.ws.send(JSON.stringify({ type: 'command', ...cmd }))
        if (cmd.action === 'endcall') {
          // Defer cleanup until we receive playback_stop from the bridge,
          // so the last TTS audio finishes playing before we tear down.
          this.pendingEndcall = true
          this.endcallFallbackTimer = setTimeout(() => {
            console.log('[Session] endcall fallback timeout (60s), cleaning up')
            void this.cleanup()
          }, 60_000)
        }
      }
    })

    await this.realtimeSession.connect({ apiKey: process.env.OPENAI_API_KEY! })

    // 6. Connect ASR client; on transcript → forward event + feed isFinal to agent
    this.asrClient = new AsrClient(process.env.ASR_PROXY_URL ?? 'ws://localhost:8082')
    await this.asrClient.connect()
    this.asrClient.onTranscript((transcript, isFinal) => {
      this.sendEvent('client', 'asr_transcript', { transcript, isFinal })
      if (isFinal && transcript.trim()) {
        const text = transcript.trim()
        this.addUserMessage(text, transcript)
        this.realtimeSession?.sendMessage(text)
        this.sendEvent('client', 'send_message', { text })
      }
    })

    this.ws.send(JSON.stringify({ type: 'ready' }))

    // 7. Trigger agent to speak first (no user message needed)
    this.realtimeSession.transport.sendEvent({ type: 'response.create' } as any)

    // 8. Incoming binary audio → forward to ASR proxy (skip while muted during playback)
    this.ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (isBinary) {
        if (MUTE_DURING_PLAYBACK && this.isPlayingAudio) return
        this.asrClient?.sendAudio(data as Buffer)
      } else {
        try {
          const msg = JSON.parse((data as Buffer).toString())
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

    await this.flushHistory()

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

    const payload: CallHistoryPayload = {
      call_id: this.opts.callId || '',
      scenario: this.opts.scenario,
      phone: this.opts.phone,
      start_time: this.startTime.toISOString(),
      end_time: (this.endTime || new Date()).toISOString(),
      history: this.history,
      customer_info: { ...cd },
    }

    await sendCallHistory(callId, payload)
  }
}

function tryParseJson(val: string) {
  try { return JSON.parse(val) } catch { return val }
}
