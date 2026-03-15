import { NextRequest, NextResponse } from 'next/server';
import { allAgentSets } from '@/app/agentConfigs';
import { kbRegistry } from '@/app/lib/kbRegistry';
import { readKbItems, listKbSources } from '@/app/lib/kbReader';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  const { botId } = await params;

  if (!allAgentSets[botId]) {
    return NextResponse.json({ error: `Bot '${botId}' not found` }, { status: 404 });
  }

  const registeredSources = kbRegistry[botId] ?? [];

  // Discover kbIds present on disk (may include custom ones not in registry)
  const diskSources = await listKbSources(botId);

  // Build the full source list: registry entries first, then any extra disk sources
  const registeredKbIds = new Set(registeredSources.map((s) => s.kbId));
  const extraKbIds = diskSources.filter((kbId) => !registeredKbIds.has(kbId));

  const sources = await Promise.all([
    ...registeredSources.map(async (src) => {
      const items = await readKbItems(botId, src.kbId);
      return { ...src, itemCount: items.length };
    }),
    ...extraKbIds.map(async (kbId) => {
      const items = await readKbItems(botId, kbId);
      return { kbId, label: kbId, type: 'custom' as const, itemCount: items.length };
    }),
  ]);

  return NextResponse.json({ botId, sources });
}
