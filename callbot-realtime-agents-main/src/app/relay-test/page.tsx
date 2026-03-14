'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

type Direction = 'client' | 'server' | 'sys'

interface LoggedEvent {
  id: number
  direction: Direction
  eventName: string
  eventData: Record<string, any>
  timestamp: string
  expanded: boolean
}

const SCENARIOS = ['leadgenTNDS', 'hotlineAI', 'motheAI', 'bidvBot', 'abicHotline', 'carebotAuto365']

let eventIdCounter = 0

function nowTime() {
  return new Date().toLocaleTimeString()
}

function dirArrow(dir: Direction) {
  if (dir === 'client') return { symbol: '▲', color: '#7f5af0' }
  if (dir === 'server') return { symbol: '▼', color: '#2cb67d' }
  return { symbol: '·', color: '#f59e0b' }
}

export default function RelayTestPage() {
  const [relayUrl, setRelayUrl] = useState('ws://localhost:8091')
  const [apiKey, setApiKey] = useState('')
  const [scenario, setScenario] = useState('leadgenTNDS')
  const [phone, setPhone] = useState('0984907246')
  const [leadId, setLeadId] = useState('')
  const [gender, setGender] = useState('')
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [connected, setConnected] = useState(false)
  const [recording, setRecording] = useState(false)
  const [events, setEvents] = useState<LoggedEvent[]>([])
  const [audioChunks, setAudioChunks] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const mediaRef = useRef<any>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayAtRef = useRef<number>(0)
  const eventsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const addEvent = useCallback((direction: Direction, eventName: string, eventData: Record<string, any> = {}) => {
    setEvents((prev) => [
      ...prev,
      { id: eventIdCounter++, direction, eventName, eventData, timestamp: nowTime(), expanded: false },
    ])
  }, [])

  const toggleExpand = useCallback((id: number) => {
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, expanded: !e.expanded } : e))
  }, [])

  // Play raw PCM16 8kHz mono buffer in browser, queued sequentially
  const playPcm16 = useCallback((data: ArrayBuffer) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: 8000 })
    }
    const ctx = audioCtxRef.current
    const raw = new Int16Array(data)
    const floats = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i++) floats[i] = raw[i] / 32768
    const buf = ctx.createBuffer(1, floats.length, 8000)
    buf.getChannelData(0).set(floats)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const startAt = Math.max(ctx.currentTime, nextPlayAtRef.current)
    src.start(startAt)
    nextPlayAtRef.current = startAt + buf.duration
  }, [])

  const connect = useCallback(() => {
    const params = new URLSearchParams({ scenario, phone, leadId, gender, name, plate })
    if (apiKey) params.set('apiKey', apiKey)
    const url = `${relayUrl}/?${params}`
    addEvent('sys', 'connecting', { url })

    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      addEvent('sys', 'ws_open', {})
    }

    ws.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        setAudioChunks((n) => n + 1)
        addEvent('server', 'audio_chunk', { bytes: evt.data.byteLength })
        playPcm16(evt.data)
        return
      }
      try {
        const msg = JSON.parse(evt.data)
        if (msg.type === 'event') {
          // SDK event forwarded from relay server
          addEvent(msg.direction as Direction, msg.eventName, msg.eventData ?? {})
        } else {
          // control messages: ready, command, error
          addEvent('server', msg.type, msg)
          if (msg.type === 'command' && msg.action === 'endcall') {
            addEvent('sys', 'call_ended', {})
            disconnect()
          }
        }
      } catch {
        addEvent('server', 'raw', { data: evt.data })
      }
    }

    ws.onclose = (evt) => {
      setConnected(false)
      setRecording(false)
      wsRef.current = null
      addEvent('sys', 'ws_closed', { code: evt.code })
    }

    ws.onerror = () => addEvent('sys', 'ws_error', {})
  }, [relayUrl, apiKey, scenario, phone, leadId, gender, name, plate, addEvent, playPcm16])

  const disconnect = useCallback(() => {
    stopMic()
    wsRef.current?.send(JSON.stringify({ type: 'hangup' }))
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
  }, [])

  const sendJson = useCallback((obj: object) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify(obj))
    addEvent('client', (obj as any).type, obj)
  }, [addEvent])

  const startMic = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 8000, channelCount: 1, echoCancellation: true },
      })
      const ctx = new AudioContext({ sampleRate: 8000 })
      const src = ctx.createMediaStreamSource(stream)
      const proc = ctx.createScriptProcessor(1024, 1, 1)
      proc.onaudioprocess = (e: any) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        const f32 = e.inputBuffer.getChannelData(0)
        const i16 = new Int16Array(f32.length)
        for (let i = 0; i < f32.length; i++) {
          i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32768)))
        }
        wsRef.current.send(i16.buffer)
      }
      src.connect(proc)
      proc.connect(ctx.destination)
      mediaRef.current = { stream, ctx, src, proc }
      setRecording(true)
      addEvent('sys', 'mic_started', { sampleRate: 8000 })
    } catch (err: any) {
      addEvent('sys', 'mic_error', { message: err.message })
    }
  }, [addEvent])

  const stopMic = useCallback(() => {
    const refs = mediaRef.current
    if (!refs) return
    refs.proc?.disconnect()
    refs.src?.disconnect()
    refs.ctx?.close()
    refs.stream?.getTracks().forEach((t: MediaStreamTrack) => t.stop())
    mediaRef.current = null
    setRecording(false)
    addEvent('sys', 'mic_stopped', {})
  }, [addEvent])

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '16px' }}>Relay Server Test</h2>

      {/* Connection config */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <label>
          Relay URL
          <input style={inputStyle} value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)} disabled={connected} />
        </label>
        <label>
          API Key (server auth)
          <input style={inputStyle} value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={connected} placeholder="leave empty if RELAY_API_KEY not set" />
        </label>
        <label>
          Scenario
          <select style={inputStyle} value={scenario} onChange={(e) => setScenario(e.target.value)} disabled={connected}>
            {SCENARIOS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Phone
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} disabled={connected} />
        </label>
        <label>
          Lead ID
          <input style={inputStyle} value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={connected} />
        </label>
        <label>
          Gender override
          <input style={inputStyle} value={gender} onChange={(e) => setGender(e.target.value)} disabled={connected} placeholder="e.g. Anh / Chị" />
        </label>
        <label>
          Name override
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} disabled={connected} placeholder="e.g. Minh" />
        </label>
        <label>
          Plate override
          <input style={inputStyle} value={plate} onChange={(e) => setPlate(e.target.value)} disabled={connected} placeholder="e.g. 51G-12345" />
        </label>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {!connected
          ? <button style={btn('#2563eb')} onClick={connect}>Connect</button>
          : <button style={btn('#dc2626')} onClick={disconnect}>Disconnect</button>}
        {connected && !recording && <button style={btn('#16a34a')} onClick={startMic}>Start Mic</button>}
        {connected && recording  && <button style={btn('#ca8a04')} onClick={stopMic}>Stop Mic</button>}
        {connected && <button style={btn('#7c3aed')} onClick={() => sendJson({ type: 'interrupt' })}>Interrupt</button>}
        {connected && <button style={btn('#475569')} onClick={() => sendJson({ type: 'hangup' })}>Hangup</button>}
        <button style={btn('#374151')} onClick={() => { setEvents([]); setAudioChunks(0) }}>Clear</button>
      </div>

      {/* Status bar */}
      <div style={{
        padding: '6px 10px', marginBottom: '8px', borderRadius: '4px', fontSize: '13px',
        background: connected ? '#d1fae5' : '#fee2e2',
        color: connected ? '#065f46' : '#991b1b',
      }}>
        {connected
          ? `Connected${recording ? ' · Mic active' : ''} · Audio received: ${audioChunks} chunk(s)`
          : 'Disconnected'}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', fontSize: '12px', color: '#64748b' }}>
        <span><span style={{ color: '#7f5af0' }}>▲</span> client (outgoing / local)</span>
        <span><span style={{ color: '#2cb67d' }}>▼</span> server (OpenAI / ASR / TTS)</span>
        <span><span style={{ color: '#f59e0b' }}>·</span> system</span>
      </div>

      {/* Events panel */}
      <div style={{
        height: '520px', overflowY: 'auto', background: '#fff',
        border: '1px solid #e2e8f0', borderRadius: '8px',
      }}>
        {events.length === 0 && (
          <div style={{ padding: '20px', color: '#94a3b8', fontSize: '13px' }}>
            No events yet. Click Connect to start.
          </div>
        )}
        {events.map((ev) => {
          const arrow = dirArrow(ev.direction)
          const isError = ev.eventName.toLowerCase().includes('error')
          const hasData = Object.keys(ev.eventData).length > 0
          return (
            <div key={ev.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '6px 16px', fontFamily: 'monospace' }}>
              <div
                onClick={() => hasData && toggleExpand(ev.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: hasData ? 'pointer' : 'default' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                  <span style={{ color: arrow.color, fontSize: '12px' }}>{arrow.symbol}</span>
                  <span style={{ fontSize: '13px', color: isError ? '#dc2626' : '#1e293b' }}>
                    {ev.eventName}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{ev.timestamp}</span>
              </div>
              {ev.expanded && hasData && (
                <pre style={{
                  margin: '4px 0 2px 18px', padding: '8px',
                  borderLeft: '2px solid #e2e8f0',
                  fontSize: '11px', color: '#334155',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: '#f8fafc', borderRadius: '4px',
                }}>
                  {JSON.stringify(ev.eventData, null, 2)}
                </pre>
              )}
            </div>
          )
        })}
        <div ref={eventsEndRef} />
      </div>

      <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
        Click any event row to expand its payload. Audio chunks are played sequentially.
      </p>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: '4px',
  padding: '6px 8px', border: '1px solid #cbd5e1',
  borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px',
}

function btn(bg: string): React.CSSProperties {
  return {
    padding: '7px 16px', background: bg, color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer',
    fontSize: '13px', fontFamily: 'monospace',
  }
}
