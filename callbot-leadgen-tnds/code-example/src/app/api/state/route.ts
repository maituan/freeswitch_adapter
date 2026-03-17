import { NextRequest, NextResponse } from 'next/server';
import { redisGetJson, redisSetJson } from '@/app/lib/redis';

export const runtime = 'nodejs';

type CallState = {
  sessionId: string;
  agentConfig: string;
  lastAgentName?: string;
  data?: Record<string, any>;
  updatedAt: number;
};

const inMemoryFallbackStore = new Map<string, CallState>();

function keyFor(agentConfig: string, sessionId: string) {
  return `call_state:${agentConfig}:${sessionId}`;
}

function isPlainObject(v: any): v is Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base: any, patch: any) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out: Record<string, any> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = String(searchParams.get('sessionId') ?? '').trim();
    const agentConfig = String(searchParams.get('agentConfig') ?? '').trim();

    if (!sessionId || !agentConfig) {
      return NextResponse.json({ error: 'sessionId_and_agentConfig_required' }, { status: 400 });
    }

    const key = keyFor(agentConfig, sessionId);
    const state = (await redisGetJson<CallState>(key)) ?? inMemoryFallbackStore.get(key) ?? null;
    // If Redis is unavailable, redisGetJson returns null (best-effort).
    return NextResponse.json({ ok: true, state: state ?? null });
  } catch (err: any) {
    console.error('[api/state] GET error', err);
    return NextResponse.json(
      { error: 'failed', details: err?.message ? String(err.message) : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body?.sessionId ?? '').trim();
    const agentConfig = String(body?.agentConfig ?? '').trim();
    const lastAgentName = typeof body?.lastAgentName === 'string' ? body.lastAgentName.trim() : undefined;
    const dataPatch = isPlainObject(body?.data) ? (body.data as Record<string, any>) : undefined;

    if (!sessionId || !agentConfig) {
      return NextResponse.json({ error: 'sessionId_and_agentConfig_required' }, { status: 400 });
    }

    const key = keyFor(agentConfig, sessionId);
    const prev = await redisGetJson<CallState>(key);
    const mergedData = dataPatch ? deepMerge(prev?.data ?? {}, dataPatch) : prev?.data;

    const state: CallState = {
      sessionId,
      agentConfig,
      lastAgentName: (lastAgentName || prev?.lastAgentName) ?? undefined,
      data: mergedData,
      updatedAt: Date.now(),
    };

    inMemoryFallbackStore.set(key, state);
    // Keep 7 days by default
    await redisSetJson(key, state, 60 * 60 * 24 * 7);
    return NextResponse.json({ ok: true, state });
  } catch (err: any) {
    console.error('[api/state] POST error', err);
    return NextResponse.json(
      { error: 'failed', details: err?.message ? String(err.message) : String(err) },
      { status: 500 },
    );
  }
}

