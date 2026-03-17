import { NextResponse } from "next/server";

const startedAt = new Date().toISOString();

export async function GET() {
  const status: Record<string, unknown> = {
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    startedAt,
  };

  return NextResponse.json(status);
}


