'use client'

import React, { useState } from 'react'

export default function SingleCallPage() {
  const [phone, setPhone] = useState('')
  const [sip, setSip] = useState('')
  const [scenario, setScenario] = useState('leadgenTNDS')
  const [callerId, setCallerId] = useState('callbot')
  const [voiceId, setVoiceId] = useState('')
  const [customData, setCustomData] = useState('{"gender":"Anh","name":"Tùng","plate":"50A-12345"}')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!phone && !sip) {
      alert('Nhập số điện thoại hoặc SIP endpoint')
      return
    }
    let custom: any = {}
    if (customData.trim()) {
      try {
        custom = JSON.parse(customData)
      } catch {
        alert('Custom Data JSON không hợp lệ')
        return
      }
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          sip_endpoint: sip,
          caller_id: callerId,
          scenario,
          voice_id: voiceId || undefined,
          custom_data: custom,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Lỗi tạo cuộc gọi')
      }
      setResult(data)
    } catch (e: any) {
      alert(e.message || 'Lỗi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-200">Gọi lẻ</h2>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <label className="space-y-1">
          <div className="text-slate-400">Số điện thoại</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="097..."
          />
        </label>
        <label className="space-y-1">
          <div className="text-slate-400">SIP Endpoint (thay SĐT)</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
            value={sip}
            onChange={(e) => setSip(e.target.value)}
            placeholder="sofia/gateway/..."
          />
        </label>
        <label className="space-y-1">
          <div className="text-slate-400">Kịch bản</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <div className="text-slate-400">Caller ID</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
            value={callerId}
            onChange={(e) => setCallerId(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <div className="text-slate-400">Giọng đọc (voice_id)</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            placeholder="ví dụ: phuongnhi-north"
          />
        </label>
      </div>

      <label className="block text-xs space-y-1">
        <div className="text-slate-400">
          Custom Data JSON (gender, name, plate, v.v.)
        </div>
        <textarea
          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] h-24"
          value={customData}
          onChange={(e) => setCustomData(e.target.value)}
        />
      </label>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="inline-flex items-center px-3 py-1.5 rounded bg-indigo-500 text-xs font-medium disabled:opacity-60"
      >
        {loading ? 'Đang gọi...' : 'Gọi ngay'}
      </button>

      {result && (
        <pre className="mt-4 text-[11px] bg-slate-900 border border-slate-800 rounded p-2 overflow-x-auto">
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  )
}

