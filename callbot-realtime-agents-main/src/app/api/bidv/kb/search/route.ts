import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { bidvKbItems } from '@/app/agentConfigs/bidvBot/sampleData';
import { readKbItems, seedIfEmpty } from '@/app/lib/kbReader';

export const runtime = 'nodejs';

type Scenario = 'SMARTBANKING_LOGIN' | 'CARD_GNND';

type IndexedDoc = {
  id: string;
  scenario: Scenario;
  cause: string;
  guidance: string;
  docText: string;
  embedding: number[];
  norm: number;
};

let cache:
  | {
      model: string;
      docsByScenario: Record<Scenario, IndexedDoc[]>;
      builtAt: number;
    }
  | undefined;

function cosineSimilarity(a: number[], b: number[], normA: number, normB: number) {
  const denom = normA * normB;
  if (!denom) return 0;
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
  return dot / denom;
}

function l2Norm(v: number[]) {
  let sum = 0;
  for (const x of v) sum += x * x;
  return Math.sqrt(sum);
}

type BidvKbItem = {
  id: string;
  scenario: Scenario;
  cause: string;
  guidance: string;
  keywords: string[];
  steps?: Array<{ kind: string; text: string }>;
};

async function loadKbItems(): Promise<BidvKbItem[]> {
  await seedIfEmpty('bidvBot', 'procedures', bidvKbItems as Array<{ id: string; [k: string]: unknown }>);
  const items = await readKbItems<BidvKbItem>('bidvBot', 'procedures');
  return items.length ? items : (bidvKbItems as BidvKbItem[]);
}

async function ensureIndex(openai: OpenAI) {
  const model = process.env.BIDV_KB_EMBEDDING_MODEL || 'text-embedding-3-large';
  if (cache?.model === model && cache.docsByScenario?.SMARTBANKING_LOGIN?.length) return cache;

  const items = await loadKbItems();

  const toDocText = (it: (typeof items)[number]) =>
    [
      `Scenario: ${it.scenario}`,
      `Cause: ${it.cause}`,
      `Guidance: ${it.guidance}`,
      it.steps?.length ? `Steps: ${it.steps.map((s) => `${s.kind}:${s.text}`).join(' | ')}` : '',
      it.keywords?.length ? `Keywords: ${it.keywords.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

  const docTexts = items.map(toDocText);
  const emb = await openai.embeddings.create({
    model,
    input: docTexts,
  });

  const docs: IndexedDoc[] = items.map((it, idx) => {
    const embedding = emb.data[idx]?.embedding ?? [];
    const norm = l2Norm(embedding);
    return {
      id: it.id,
      scenario: it.scenario,
      cause: it.cause,
      guidance: it.guidance,
      docText: docTexts[idx],
      embedding,
      norm,
    };
  });

  const docsByScenario: Record<Scenario, IndexedDoc[]> = {
    SMARTBANKING_LOGIN: docs.filter((d) => d.scenario === 'SMARTBANKING_LOGIN'),
    CARD_GNND: docs.filter((d) => d.scenario === 'CARD_GNND'),
  };

  cache = {
    model,
    docsByScenario,
    builtAt: Date.now(),
  };
  return cache;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const scenario = body?.scenario as Scenario;
    const query = String(body?.query ?? '');
    const topK = Math.max(1, Math.min(10, Number(body?.topK ?? 5)));

    if (!scenario || !['SMARTBANKING_LOGIN', 'CARD_GNND'].includes(scenario)) {
      return NextResponse.json({ error: 'invalid_scenario' }, { status: 400 });
    }
    if (!query.trim()) {
      return NextResponse.json({ error: 'query_required' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const idx = await ensureIndex(openai);

    const qEmb = await openai.embeddings.create({
      model: idx.model,
      input: query,
    });
    const qVec = qEmb.data[0]?.embedding ?? [];
    const qNorm = l2Norm(qVec);

    const docs = idx.docsByScenario[scenario] ?? [];
    const ranked = docs
      .map((d) => ({
        id: d.id,
        cause: d.cause,
        guidance: d.guidance,
        score: cosineSimilarity(qVec, d.embedding, qNorm, d.norm),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return NextResponse.json({
      ok: true,
      scenario,
      embeddingModel: idx.model,
      topK,
      results: ranked,
      builtAt: idx.builtAt,
    });
  } catch (err: any) {
    console.error('[BIDV KB Search] error', err);
    return NextResponse.json(
      { error: 'failed', details: err?.message ? String(err.message) : String(err) },
      { status: 500 },
    );
  }
}

