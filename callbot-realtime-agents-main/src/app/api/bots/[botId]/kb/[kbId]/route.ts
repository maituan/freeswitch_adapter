import { NextRequest, NextResponse } from 'next/server';
import { allAgentSets } from '@/app/agentConfigs';
import { readKbItems } from '@/app/lib/kbReader';
import { upsertKbItem } from '@/app/lib/kbStore';

export const runtime = 'nodejs';

type Params = { botId: string; kbId: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { botId, kbId } = await params;

  if (!allAgentSets[botId]) {
    return NextResponse.json({ error: `Bot '${botId}' not found` }, { status: 404 });
  }

  const items = await readKbItems(botId, kbId);
  return NextResponse.json({ botId, kbId, items });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { botId, kbId } = await params;

  if (!allAgentSets[botId]) {
    return NextResponse.json({ error: `Bot '${botId}' not found` }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.content && !body.answer) {
    return NextResponse.json(
      { error: 'Body must include at least one of: content, answer' },
      { status: 400 },
    );
  }

  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const item = { ...body, id };

  await upsertKbItem(botId, kbId, item as { id: string; [k: string]: unknown });

  return NextResponse.json({ ok: true, item }, { status: 201 });
}
