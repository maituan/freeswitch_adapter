import { listHistory } from '@lib/historyRepo'

export const dynamic = 'force-dynamic'

async function getData(searchParams: Record<string, string | string[] | undefined>) {
  const phone = typeof searchParams.phone === 'string' ? searchParams.phone : undefined
  const scenario = typeof searchParams.scenario === 'string' ? searchParams.scenario : undefined
  const page = searchParams.page ? Number(searchParams.page) : 1
  return listHistory({ phone, scenario, page, pageSize: 20 })
}

export default async function HistoryPage(props: any) {
  const searchParams = (props && props.searchParams) || {}
  const { items, total } = await getData(searchParams as any)

  return (
    <div className="space-y-4 text-xs">
      <h2 className="text-sm font-semibold text-slate-200">Lịch sử cuộc gọi</h2>
      <p className="text-slate-400">Tổng: {total}</p>
      <table className="w-full border border-slate-800 border-collapse">
        <thead className="bg-slate-900">
          <tr>
            <th className="px-2 py-1 border-b border-slate-800 text-left">Thời gian</th>
            <th className="px-2 py-1 border-b border-slate-800 text-left">SĐT</th>
            <th className="px-2 py-1 border-b border-slate-800 text-left">Scenario</th>
            <th className="px-2 py-1 border-b border-slate-800 text-left">Thời lượng</th>
            <th className="px-2 py-1 border-b border-slate-800 text-left">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.call_id} className="hover:bg-slate-900">
              <td className="px-2 py-1 border-b border-slate-900">
                <a href={`/history/${encodeURIComponent(c.call_id)}`} className="text-indigo-400 hover:underline">
                  {new Date(c.start_time).toLocaleString('vi-VN')}
                </a>
              </td>
              <td className="px-2 py-1 border-b border-slate-900">{c.phone}</td>
              <td className="px-2 py-1 border-b border-slate-900">{c.scenario}</td>
              <td className="px-2 py-1 border-b border-slate-900">{c.duration_sec}s</td>
              <td className="px-2 py-1 border-b border-slate-900">{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

