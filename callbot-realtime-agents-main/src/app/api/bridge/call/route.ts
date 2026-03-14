import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const bridgeUrl = (body.bridgeUrl as string) || 'http://localhost:8083'
  delete body.bridgeUrl

  try {
    const res = await fetch(`${bridgeUrl}/api/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: any) {
    return NextResponse.json({ error: `Bridge unreachable: ${err.message}` }, { status: 502 })
  }
}
