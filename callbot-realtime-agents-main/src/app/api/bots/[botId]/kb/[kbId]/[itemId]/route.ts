import { NextRequest, NextResponse } from 'next/server';
import { allAgentSets } from '@/app/agentConfigs';
import { getKbItem, upsertKbItem, deleteKbItem } from '@/app/lib/kbStore';

export const runtime = 'nodejs';

type Params = { botId: string; kbId: string; itemId: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { botId, kbId, itemId } = await params;

  if (!allAgentSets[botId]) {
    return NextResponse.json({ error: `Bot '${botId}' not found` }, { status: 404 });
  }

  const item = await getKbItem(botId, kbId, itemId);
  if (!item) {
    return NextResponse.json(
      { error: `Item '${itemId}' not found in ${botId}/${kbId}` },
      { status: 404 },
    );
  }

  return NextResponse.json({ botId, kbId, item });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { botId, kbId, itemId } = await params;

  if (!allAgentSets[botId]) {
    return NextResponse.json({ error: `Bot '${botId}' not found` }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Merge with existing item if present
  const existing = (await getKbItem(botId, kbId, itemId)) ?? {};
  const item = { ...existing, ...body, id: itemId };

  await upsertKbItem(botId, kbId, item as { id: string; [k: string]: unknown });

  return NextResponse.json({ ok: true, item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { botId, kbId, itemId } = await params;

  if (!allAgentSets[botId]) {
    return NextResponse.json({ error: `Bot '${botId}' not found` }, { status: 404 });
  }

  try {
    await deleteKbItem(botId, kbId, itemId);
  } catch {
    return NextResponse.json(
      { error: `Item '${itemId}' not found in ${botId}/${kbId}` },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
