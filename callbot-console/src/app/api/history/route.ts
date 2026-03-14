import { NextRequest, NextResponse } from 'next/server'
import { listHistory } from '@lib/historyRepo'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const phone = sp.get('phone') || undefined
    const scenario = sp.get('scenario') || undefined
    const from = sp.get('from') || undefined
    const to = sp.get('to') || undefined
    const page = sp.get('page') ? Number(sp.get('page')) : 1

    const data = await listHistory({ phone, scenario, from, to, page })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'history fetch failed' },
      { status: 500 },
    )
  }
}

