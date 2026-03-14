import { NextRequest, NextResponse } from 'next/server'
import { proxyCampaignCreate, proxyCampaignGet } from '@lib/bridgeClient'

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.toString()
    const data = await proxyCampaignGet(query)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'campaign get failed' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const data = await proxyCampaignCreate(formData as any)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'campaign create failed' },
      { status: 500 },
    )
  }
}

