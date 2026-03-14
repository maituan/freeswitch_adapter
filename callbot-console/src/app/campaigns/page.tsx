'use client'

import React, { useState } from 'react'

export default function CampaignsPage() {
  const [scenario, setScenario] = useState('leadgenTNDS')
  const [callerId, setCallerId] = useState('callbot')
  const [ccu, setCcu] = useState(3)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!file) {
      alert('Chọn file CSV')
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('scenario', scenario)
    fd.append('caller_id', callerId)
    fd.append('ccu', String(ccu))

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/campaign', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi tạo chiến dịch')
      setResult(data)
    } catch (e: any) {
      alert(e.message || 'Lỗi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 text-xs">
      <h2 className="text-sm font-semibold text-slate-200">Chiến dịch</h2>
      <div className="grid grid-cols-2 gap-3">
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
          <div className="text-slate-400">CCU (số cuộc đồng thời)</div>
          <input
            type="number"
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
            value={ccu}
            onChange={(e) => setCcu(Number(e.target.value) || 1)}
            min={1}
          />
        </label>
        <label className="space-y-1">
          <div className="text-slate-400">File CSV</div>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={loading}
        className="inline-flex items-center px-3 py-1.5 rounded bg-indigo-500 text-xs font-medium disabled:opacity-60"
      >
        {loading ? 'Đang tạo...' : 'Tạo chiến dịch'}
      </button>

      {result && (
        <pre className="mt-4 text-[11px] bg-slate-900 border border-slate-800 rounded p-2 overflow-x-auto">
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  )
}

