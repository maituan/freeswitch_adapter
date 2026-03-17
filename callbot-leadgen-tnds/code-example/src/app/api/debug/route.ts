import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function truncateAny(val: any, maxLen = 2000): any {
  if (val == null) return val;
  if (typeof val === 'string') return val.length > maxLen ? val.slice(0, maxLen) + '…' : val;
  if (typeof val !== 'object') return val;
  try {
    const json = JSON.stringify(val);
    if (json.length <= maxLen) return val;
    return JSON.parse(json.slice(0, maxLen) + '"…"}');
  } catch {
    return '[unserializable]';
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ts = new Date().toISOString();
    const source = String(body?.source ?? 'client');
    const event = String(body?.event ?? 'log');
    const agentConfig = body?.agentConfig ? String(body.agentConfig) : undefined;
    const sessionId = body?.sessionId ? String(body.sessionId) : undefined;
    const agentName = body?.agentName ? String(body.agentName) : undefined;
    const data = truncateAny(body?.data, 4000);

    const prefixParts = ['[DEBUG]', ts, source, event];
    if (agentConfig) prefixParts.push(`agentConfig=${agentConfig}`);
    if (sessionId) prefixParts.push(`sessionId=${sessionId}`);
    if (agentName) prefixParts.push(`agent=${agentName}`);
    const prefix = prefixParts.join(' ');

    console.log(prefix, data ?? '');

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[DEBUG] failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

