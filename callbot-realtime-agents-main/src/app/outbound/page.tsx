'use client'

import { useState } from 'react'

const SCENARIOS = ['leadgenTNDS', 'hotlineAI', 'motheAI', 'bidvBot', 'abicHotline', 'carebotAuto365']

interface CallRecord {
  time: string
  phone: string
  scenario: string
  uuid: string
  status: 'dialing' | 'error'
  error?: string
}

export default function OutboundPage() {
  const [bridgeUrl, setBridgeUrl] = useState('http://localhost:8083')
  const [phone, setPhone] = useState('0901234567')
  const [sipEndpoint, setSipEndpoint] = useState('')
  const [callerID, setCallerID] = useState('02899999999')
  const [scenario, setScenario] = useState('leadgenTNDS')
  const [leadId, setLeadId] = useState('')
  const [gender, setGender] = useState('')
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [loading, setLoading] = useState(false)
  const [calls, setCalls] = useState<CallRecord[]>([])

  const canCall = !loading && (phone.trim() !== '' || sipEndpoint.trim() !== '')

  const submit = async () => {
    if (!canCall) return
    setLoading(true)
    try {
      const body: Record<string, string> = {
        bridgeUrl,
        scenario,
        caller_id: callerID.trim(),
      }
      if (phone.trim())       body.phone        = phone.trim()
      if (sipEndpoint.trim()) body.sip_endpoint = sipEndpoint.trim()
      if (leadId.trim())      body.lead_id      = leadId.trim()
      if (gender.trim())      body.gender       = gender.trim()
      if (name.trim())        body.name         = name.trim()
      if (plate.trim())       body.plate        = plate.trim()

      const res = await fetch('/api/bridge/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setCalls((prev) => [{
        time: new Date().toLocaleTimeString(),
        phone: phone.trim() || sipEndpoint.trim(),
        scenario,
        uuid: data.uuid ?? '',
        status: data.error ? 'error' : 'dialing',
        error: data.error,
      }, ...prev])
    } catch (err: any) {
      setCalls((prev) => [{
        time: new Date().toLocaleTimeString(),
        phone: phone.trim() || sipEndpoint.trim(),
        scenario,
        uuid: '',
        status: 'error',
        error: err.message,
      }, ...prev])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '32px 16px' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: '#0f172a' }}>
          Outbound Call
        </h2>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px' }}>

          <Field label="Bridge URL">
            <input style={inp} value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} />
          </Field>

          <Divider label="Target" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Phone number">
              <input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901234567" />
            </Field>
            <Field label="SIP endpoint">
              <input style={inp} value={sipEndpoint} onChange={(e) => setSipEndpoint(e.target.value)} placeholder="sofia/gateway/gw/0901234567" />
            </Field>
          </div>
          <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '-4px', marginBottom: '4px', fontFamily: 'monospace' }}>
            SIP endpoint takes precedence over phone if both are filled.
          </p>

          <Divider label="Call settings" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Scenario">
              <select style={inp} value={scenario} onChange={(e) => setScenario(e.target.value)}>
                {SCENARIOS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Caller ID">
              <input style={inp} value={callerID} onChange={(e) => setCallerID(e.target.value)} />
            </Field>
            <Field label="Lead ID">
              <input style={inp} value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="optional" />
            </Field>
            <Field label="Gender">
              <input style={inp} value={gender} onChange={(e) => setGender(e.target.value)} placeholder="Anh / Chị" />
            </Field>
            <Field label="Name">
              <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="optional" />
            </Field>
            <Field label="Plate">
              <input style={inp} value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="51G-12345" />
            </Field>
          </div>

          <button
            onClick={submit}
            disabled={!canCall}
            style={{
              marginTop: '20px',
              width: '100%',
              padding: '12px',
              background: canCall ? '#2563eb' : '#e2e8f0',
              color: canCall ? '#fff' : '#94a3b8',
              border: 'none',
              borderRadius: '6px',
              fontSize: '15px',
              fontFamily: 'monospace',
              fontWeight: 600,
              cursor: canCall ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? 'Dialing…' : 'Call'}
          </button>
        </div>

        {calls.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '10px' }}>
              Call history
            </div>
            {calls.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
                padding: '10px 14px', marginBottom: '6px',
                borderRadius: '7px', fontSize: '13px', fontFamily: 'monospace',
                background: c.status === 'error' ? '#fff1f2' : '#f0fdf4',
                border: `1px solid ${c.status === 'error' ? '#fecdd3' : '#bbf7d0'}`,
                color: '#1e293b',
              }}>
                <span style={{ color: '#94a3b8' }}>{c.time}</span>
                <span style={{ fontWeight: 600 }}>{c.phone}</span>
                <span style={{ color: '#64748b' }}>{c.scenario}</span>
                {c.uuid && <span style={{ color: '#94a3b8' }}>uuid: {c.uuid}</span>}
                {c.error && <span style={{ color: '#e11d48' }}>{c.error}</span>}
                <span style={{
                  marginLeft: 'auto', padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
                  background: c.status === 'error' ? '#fecdd3' : '#bbf7d0',
                  color: c.status === 'error' ? '#9f1239' : '#166534',
                }}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{
        display: 'block', fontSize: '12px', fontWeight: 600,
        color: '#475569', marginBottom: '5px', fontFamily: 'monospace',
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0 14px' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '5px',
  fontFamily: 'monospace',
  fontSize: '13px',
  color: '#0f172a',
  background: '#fff',
  boxSizing: 'border-box',
}
