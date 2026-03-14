import { getHistoryById } from '@lib/historyRepo'

export const dynamic = 'force-dynamic'

export default async function HistoryDetailPage(props: any) {
  const callId = props?.params?.callId as string
  const data = await getHistoryById(callId)
  if (!data) {
    return <div className="text-xs text-red-400">Không tìm thấy cuộc gọi</div>
  }

  return (
    <div className="space-y-4 text-xs">
      <h2 className="text-sm font-semibold text-slate-200">Chi tiết cuộc gọi</h2>
      <div className="space-y-1">
        <div>Call ID: {data.call_id}</div>
        <div>SĐT: {data.phone}</div>
        <div>Scenario: {data.scenario}</div>
        <div>
          Thời gian: {new Date(data.start_time).toLocaleString('vi-VN')} →{' '}
          {new Date(data.end_time).toLocaleString('vi-VN')} ({data.duration_sec}s)
        </div>
      </div>

      <div className="space-y-2">
        {data.history.map((m, idx) => (
          <div key={idx} className="border border-slate-800 rounded p-2">
            <div className="flex justify-between mb-1">
              <span className="font-semibold">
                {m.role === 'assistant' ? 'BOT' : 'KHÁCH'} · turn {m.turn_id}
              </span>
              <span className="text-slate-500">
                {new Date(m.timestamp).toLocaleTimeString('vi-VN')}
              </span>
            </div>
            <div className="text-slate-200">{m.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

