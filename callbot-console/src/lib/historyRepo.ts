import { getPool } from './db'

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
  origin_content: string
  turn_id: number
  timestamp: string
}

export interface CallHistory {
  call_id: string
  scenario: string
  phone: string
  lead_id: string | null
  gender: string | null
  name: string | null
  plate: string | null
  start_time: string
  end_time: string
  duration_sec: number
  status: string
  history: HistoryMessage[]
}

export async function listHistory(params: {
  phone?: string
  scenario?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}): Promise<{ items: CallHistory[]; total: number }> {
  const pool = getPool()
  const page = params.page && params.page > 0 ? params.page : 1
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 20
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const values: any[] = []

  if (params.phone) {
    values.push(params.phone)
    where.push(`phone = $${values.length}`)
  }
  if (params.scenario) {
    values.push(params.scenario)
    where.push(`scenario = $${values.length}`)
  }
  if (params.from) {
    values.push(params.from)
    where.push(`start_time >= $${values.length}`)
  }
  if (params.to) {
    values.push(params.to)
    where.push(`start_time <= $${values.length}`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const totalRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::bigint AS count FROM call_history ${whereSql}`,
    values,
  )
  const total = Number(totalRes.rows[0]?.count || 0)

  const res = await pool.query<CallHistory>(
    `SELECT * FROM call_history ${whereSql} ORDER BY start_time DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset],
  )

  return { items: res.rows, total }
}

export async function getHistoryById(callId: string): Promise<CallHistory | null> {
  const pool = getPool()
  const res = await pool.query<CallHistory>(
    'SELECT * FROM call_history WHERE call_id = $1 LIMIT 1',
    [callId],
  )
  return res.rows[0] || null
}

