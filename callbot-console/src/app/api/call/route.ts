import { NextRequest, NextResponse } from 'next/server'
import { proxyCall } from '@lib/bridgeClient'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = await proxyCall(body)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'call failed' },
      { status: 500 },
    )
  }
}

