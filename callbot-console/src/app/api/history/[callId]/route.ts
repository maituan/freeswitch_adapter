import { NextRequest, NextResponse } from 'next/server'
import { getHistoryById } from '@lib/historyRepo'

export async function GET(_req: NextRequest, context: any) {
  try {
    const { callId } = context.params || {}
    const data = await getHistoryById(callId)
    if (!data) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'history detail failed' },
      { status: 500 },
    )
  }
}

