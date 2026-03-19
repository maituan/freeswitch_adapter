import { NextResponse } from 'next/server'

const TTS_VOICES_URL = process.env.TTS_VOICES_URL || 'http://103.253.20.27:8767/voices'

export async function GET() {
  try {
    const res = await fetch(TTS_VOICES_URL)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: any) {
    return NextResponse.json({ voices: [], error: err.message }, { status: 502 })
  }
}
