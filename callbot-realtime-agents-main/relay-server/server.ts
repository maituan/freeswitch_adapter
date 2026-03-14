import { WebSocketServer } from 'ws'
import { CallSession } from './session'

const PORT = process.env.RELAY_PORT ?? 8091

// If set, every connection must supply a matching ?eKey= param.
// Leave RELAY_API_KEY unset (or empty) to disable auth.
const RELAY_API_KEY = process.env.RELAY_API_KEY ?? ''

const wss = new WebSocketServer({ port: Number(PORT) })
console.log(`[Relay] WebSocket server listening on port ${PORT}`)

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://localhost`)
  const p = url.searchParams

  // --- Auth: static pre-shared key (separate from session ephemeral key) ---
  if (RELAY_API_KEY) {
    const apiKey = p.get('apiKey') ?? ''
    if (apiKey !== RELAY_API_KEY) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }))
      ws.close(1008, 'Unauthorized')
      return
    }
  }

  let customData: Record<string, any> = {}
  try {
    const raw = p.get('customData')
    if (raw) customData = JSON.parse(raw)
  } catch {}

  const opts = {
    callId     : p.get('callId')    ?? '',
    scenario   : p.get('scenario')  ?? 'leadgenTNDS',
    phone      : p.get('phone')     ?? '',
    leadId     : p.get('leadId')    ?? customData.leadId ?? '',
    gender     : p.get('gender')    ?? customData.gender ?? '',
    name       : p.get('name')      ?? customData.name   ?? '',
    plate      : p.get('plate')     ?? customData.plate  ?? '',
    voiceId    : p.get('voiceId')   ?? customData.voiceId ?? '',
    customData,
  }

  console.log(`[Relay] New connection:`, opts)
  new CallSession(ws, opts).start()
})
