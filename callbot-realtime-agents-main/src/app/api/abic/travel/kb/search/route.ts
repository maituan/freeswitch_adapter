import { NextRequest, NextResponse } from 'next/server';
import { readKbItems, seedIfEmpty } from '@/app/lib/kbReader';
import { abicTravelKbItems } from '@/app/agentConfigs/abicHotline/travel/travelKb';

export const runtime = 'nodejs';

type AbicTravelScope = 'TRAVEL_DOMESTIC' | 'TRAVEL_INTERNATIONAL' | 'TRAVEL_FLIGHT';
type AbicToolScope = AbicTravelScope | 'AUTO';

type KbItem = {
  id: string;
  scope: AbicTravelScope;
  title: string;
  content: string;
  source: string;
  keywords: string[];
};

type DocIndex = KbItem & { tf: Record<string, number>; len: number };

function normalizeForSearch(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string) {
  const n = normalizeForSearch(s);
  return n ? n.split(' ').filter(Boolean) : [];
}

function buildDocIndex(items: KbItem[]): DocIndex[] {
  return items.map((item) => {
    const text = `${item.title} ${item.content} ${item.keywords.join(' ')}`.trim();
    const tokens = tokenize(text);
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
    return { ...item, tf, len: tokens.length };
  });
}

function bm25Score(query: string, docs: DocIndex[], k1 = 1.5, b = 0.75) {
  const qTokens = tokenize(query);
  if (!docs.length || !qTokens.length) return docs.map((d) => ({ doc: d, score: 0 }));

  const avgdl = docs.reduce((s, d) => s + d.len, 0) / docs.length;
  const idf: Record<string, number> = {};
  for (const term of qTokens) {
    const df = docs.filter((d) => (d.tf[term] ?? 0) > 0).length;
    idf[term] = Math.log((docs.length - df + 0.5) / (df + 0.5) + 1);
  }

  return docs.map((d) => {
    let score = 0;
    for (const term of qTokens) {
      const tf = d.tf[term] ?? 0;
      const termIdf = idf[term] ?? 0;
      const denom = tf + k1 * (1 - b + b * (d.len / (avgdl || 1)));
      score += termIdf * ((tf * (k1 + 1)) / (denom || 1));
    }
    return { doc: d, score };
  });
}

function autoScopeHint(query: string): AbicTravelScope {
  const q = normalizeForSearch(query);
  if (/(may bay|chuyen bay|flight|tre chuyen|delay)/.test(q)) return 'TRAVEL_FLIGHT';
  if (/(quoc te|ra nuoc ngoai|visa|schengen|chau au)/.test(q)) return 'TRAVEL_INTERNATIONAL';
  return 'TRAVEL_DOMESTIC';
}

async function loadKbItems(): Promise<KbItem[]> {
  await seedIfEmpty('abicHotline', 'travel_kb', abicTravelKbItems as Array<{ id: string; [k: string]: unknown }>);
  const items = await readKbItems<KbItem>('abicHotline', 'travel_kb');
  return items.length ? items : (abicTravelKbItems as KbItem[]);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = String(body?.query ?? '');
    const productScope = String(body?.productScope ?? 'AUTO') as AbicToolScope;
    const topK = Math.max(1, Math.min(5, Number(body?.topK ?? 3)));

    if (!query.trim()) {
      return NextResponse.json({ error: 'query_required' }, { status: 400 });
    }

    const allItems = await loadKbItems();
    const inferred = productScope === 'AUTO' ? autoScopeHint(query) : (productScope as AbicTravelScope);
    const pool = allItems.filter((i) => i.scope === inferred);
    const docs = buildDocIndex(pool.length ? pool : allItems);
    const ranked = bm25Score(query, docs).sort((a, b) => b.score - a.score).slice(0, topK);
    const best = ranked[0];

    if (!best || (best.score ?? 0) <= 0) {
      return NextResponse.json({
        found: false,
        scopeUsed: inferred,
        message: 'Để được tư vấn kỹ hơn về trường hợp của anh chị, em xin phép chuyển máy đến tổng đài viên ạ.',
        tag: '|FORWARD',
      });
    }

    return NextResponse.json({
      found: true,
      scopeUsed: inferred,
      best: {
        id: best.doc.id,
        scope: best.doc.scope,
        title: best.doc.title,
        content: best.doc.content,
        source: best.doc.source,
        score: best.score,
      },
      top: ranked.map((r) => ({
        id: r.doc.id,
        scope: r.doc.scope,
        title: r.doc.title,
        content: r.doc.content,
        source: r.doc.source,
        score: r.score,
      })),
    });
  } catch (err: any) {
    console.error('[ABIC Travel KB Search] error', err);
    return NextResponse.json(
      { error: 'failed', details: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
