import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

type DocId = '2399' | '2400' | '2401' | '2402' | '2403' | '2404';

type ChunkDoc = {
  id: string;
  rawText: string;
  spokenText?: string;
  searchText?: string;
  tf: Record<string, number>;
  len: number;
};

type CachedDocIndex = {
  docId: DocId;
  chunks: ChunkDoc[];
  builtAt: number;
};

const cache = new Map<DocId, CachedDocIndex>();

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
  if (!n) return [];
  return n.split(' ').filter(Boolean);
}

function splitIntoChunks(md: string, maxChars = 1000) {
  const text = String(md ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return [];

  const paras = text.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
  /** @type {string[]} */
  const chunks: string[] = [];

  for (const para of paras) {
    if (para.length <= maxChars) {
      chunks.push(para);
      continue;
    }

    // Long block (often tables) — split by lines first.
    const lines = para.split('\n');
    let buf = '';
    for (const line of lines) {
      const candidate = buf ? `${buf}\n${line}` : line;
      if (candidate.length > maxChars) {
        if (buf.trim()) chunks.push(buf.trim());
        buf = line;
      } else {
        buf = candidate;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
  }

  // Merge very small chunks with next one when possible
  /** @type {string[]} */
  const merged: string[] = [];
  for (const c of chunks) {
    if (!merged.length) {
      merged.push(c);
      continue;
    }
    const prev = merged[merged.length - 1]!;
    if (prev.length < Math.floor(maxChars * 0.35) && prev.length + 2 + c.length <= maxChars) {
      merged[merged.length - 1] = `${prev}\n\n${c}`;
    } else {
      merged.push(c);
    }
  }
  return merged;
}

function buildIndexForChunks(chunks: string[]): ChunkDoc[] {
  return chunks.map((rawText, idx) => {
    const tokens = tokenize(rawText);
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
    return { id: String(idx), rawText, tf, len: tokens.length };
  });
}

function computeIdf(docs: ChunkDoc[]) {
  const df: Record<string, number> = {};
  for (const d of docs) for (const term of Object.keys(d.tf)) df[term] = (df[term] ?? 0) + 1;
  const N = docs.length || 1;
  const idf: Record<string, number> = {};
  for (const [term, n] of Object.entries(df)) idf[term] = Math.log(1 + (N - n + 0.5) / (n + 0.5));
  return idf;
}

function bm25Score(query: string, docs: ChunkDoc[]) {
  const qTokens = tokenize(query);
  const qSet = Array.from(new Set(qTokens));
  const idf = computeIdf(docs);
  const avgdl = docs.reduce((sum, d) => sum + d.len, 0) / (docs.length || 1);
  const k1 = 1.5;
  const b = 0.75;

  return docs.map((d) => {
    let score = 0;
    for (const term of qSet) {
      const tf = d.tf[term] ?? 0;
      if (!tf) continue;
      const termIdf = idf[term] ?? 0;
      const denom = tf + k1 * (1 - b + b * (d.len / (avgdl || 1)));
      score += termIdf * ((tf * (k1 + 1)) / (denom || 1));
    }
    return { doc: d, score };
  });
}

async function ensureDocIndex(docId: DocId) {
  const cached = cache.get(docId);
  if (cached?.chunks?.length) return cached;

  const indexPath = path.join(
    process.cwd(),
    'src/app/agentConfigs/abicHotline/travel/knowledge/index',
    `${docId}.json`,
  );
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    const chunks = Array.isArray(parsed?.chunks) ? parsed.chunks : [];
    const built: CachedDocIndex = { docId, chunks, builtAt: Date.now() };
    cache.set(docId, built);
    return built;
  } catch {
    // Fallback to raw markdown if index not built yet
    const docPath = path.join(
      process.cwd(),
      'src/app/agentConfigs/abicHotline/travel/knowledge',
      `${docId}.md`,
    );
    const md = await fs.readFile(docPath, 'utf8');
    const chunks = splitIntoChunks(md, 1100);
    const indexed = buildIndexForChunks(chunks);
    const built: CachedDocIndex = { docId, chunks: indexed, builtAt: Date.now() };
    cache.set(docId, built);
    return built;
  }
}

function truncate(s: string, maxChars: number) {
  const t = String(s ?? '').trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const docId = String(body?.docId ?? '') as DocId;
    const query = String(body?.query ?? '');
    const topK = Math.max(1, Math.min(5, Number(body?.topK ?? 3)));
    const maxChars = Math.max(300, Math.min(2000, Number(body?.maxChars ?? 1000)));

    const allowed: DocId[] = ['2399', '2400', '2401', '2402', '2403', '2404'];
    if (!allowed.includes(docId)) {
      return NextResponse.json({ error: 'invalid_docId' }, { status: 400 });
    }
    if (!query.trim()) {
      return NextResponse.json({ error: 'query_required' }, { status: 400 });
    }

    const idx = await ensureDocIndex(docId);
    const ranked = bm25Score(query, idx.chunks)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const best = ranked[0];
    const found = Boolean(best && (best.score ?? 0) > 0);

    return NextResponse.json({
      ok: true,
      found,
      docId,
      topK,
      builtAt: idx.builtAt,
      best: best
        ? {
            chunkId: best.doc.id,
            score: best.score,
            rawText: truncate(best.doc.rawText ?? (best.doc as any).text, maxChars),
            spokenText: best.doc.spokenText
              ? truncate(best.doc.spokenText, maxChars)
              : undefined,
          }
        : null,
      results: ranked.map((r) => ({
        chunkId: r.doc.id,
        score: r.score,
        rawText: truncate(r.doc.rawText ?? (r.doc as any).text, maxChars),
        spokenText: r.doc.spokenText ? truncate(r.doc.spokenText, maxChars) : undefined,
      })),
    });
  } catch (err: any) {
    console.error('[ABIC Travel Knowledge Search] error', err);
    return NextResponse.json(
      { error: 'failed', details: err?.message ? String(err.message) : String(err) },
      { status: 500 },
    );
  }
}

