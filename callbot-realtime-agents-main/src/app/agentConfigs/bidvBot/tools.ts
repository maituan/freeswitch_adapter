import { tool } from '@openai/agents/realtime';
import { bidvKbItems, type BidvKBScenario, type BidvKBStep } from './sampleData';

type BidvToolScenario = BidvKBScenario | 'AUTO';
type Addressing = 'anh' | 'chị' | 'quý khách';

const APP_NAME = 'BIDV SmartBanking';

function updateLockedAddressing(text: string, ctx?: Record<string, any>): Addressing {
  const t = normalizeForSearch(text);
  // Read/write addressing from per-session runContext so it never leaks across sessions.
  let current: Addressing = (ctx?._addressing as Addressing) ?? 'quý khách';
  // Only update when we see explicit self-reference; keep previous on short replies like "đúng rồi".
  if (/(^|\s)anh(\s|$)/.test(t)) current = 'anh';
  else if (/(^|\s)chi(\s|$)/.test(t)) current = 'chị';
  if (ctx) ctx._addressing = current;
  return current;
}

function renderTemplate(text: string, addressing: Addressing): string {
  const Customer = addressing === 'anh' ? 'Anh' : addressing === 'chị' ? 'Chị' : 'Quý khách';
  const customer = addressing === 'anh' ? 'anh' : addressing === 'chị' ? 'chị' : 'quý khách';
  return text
    .replaceAll('{{Customer}}', Customer)
    .replaceAll('{{customer}}', customer)
    .replaceAll('{{app}}', APP_NAME);
}

function stripTemplatesForIndexing(text: string): string {
  return text.replace(/{{[^}]+}}/g, ' ');
}

type DocIndex = {
  id: string;
  cause: string;
  guidance: string;
  keywords: string[];
  steps?: BidvKBStep[];
  text: string;
  tf: Record<string, number>;
  len: number;
};

function normalizeForSearch(s: string) {
  // Lowercase + strip Vietnamese diacritics + normalize punctuation to spaces
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

function buildDocIndex(items: typeof bidvKbItems): DocIndex[] {
  return items.map((it) => {
    const stepsText = it.steps?.map((s) => stripTemplatesForIndexing(s.text)).join(' ') ?? '';
    const text = `${it.cause} ${it.guidance} ${stepsText} ${it.keywords.join(' ')}`.trim();
    const tokens = tokenize(text);
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
    return {
      id: it.id,
      cause: it.cause,
      guidance: it.guidance,
      keywords: it.keywords,
      steps: it.steps,
      text,
      tf,
      len: tokens.length,
    };
  });
}

function computeIdf(docs: DocIndex[]) {
  const df: Record<string, number> = {};
  for (const d of docs) {
    for (const term of Object.keys(d.tf)) df[term] = (df[term] ?? 0) + 1;
  }
  const N = docs.length || 1;
  const idf: Record<string, number> = {};
  for (const [term, n] of Object.entries(df)) {
    // BM25 idf
    idf[term] = Math.log(1 + (N - n + 0.5) / (n + 0.5));
  }
  return idf;
}

function bm25Score(query: string, docs: DocIndex[]) {
  const qTokens = tokenize(query);
  const idf = computeIdf(docs);
  const avgdl = docs.reduce((sum, d) => sum + d.len, 0) / (docs.length || 1);
  const k1 = 1.5;
  const b = 0.75;

  const qSet = Array.from(new Set(qTokens));
  return docs.map((d) => {
    let score = 0;
    for (const term of qSet) {
      const tf = d.tf[term] ?? 0;
      if (!tf) continue;
      const termIdf = idf[term] ?? 0;
      const denom = tf + k1 * (1 - b + b * (d.len / (avgdl || 1)));
      score += termIdf * ((tf * (k1 + 1)) / (denom || 1));
    }

    // Phrase boost using keywords (accent-insensitive)
    const nq = normalizeForSearch(query);
    for (const kw of d.keywords) {
      const nkw = normalizeForSearch(kw);
      if (!nkw) continue;
      if (nq.includes(nkw)) {
        let w = 2;
        if (nkw.includes(' ')) w += 2;
        if (nkw.includes('loi')) w += 4;
        if (nkw.includes('ket noi') || nkw.includes('connection') || nkw.includes('network') || nkw.includes('mang')) w += 6;
        score += w;
      }
    }

    return { doc: d, score };
  });
}

function topKLexical(query: string, items: typeof bidvKbItems, k: number) {
  const docs = buildDocIndex(items);
  const ranked = bm25Score(query, docs).sort((a, b) => b.score - a.score);
  return ranked.slice(0, k).map((r) => r.doc);
}

export const lookupBidvKBTool = tool({
  name: 'lookupBidvKB',
  description:
    'Tra cứu và chọn đúng “KB item + câu thoại chuẩn (steps)” cho POC BIDV. Ưu tiên trả về steps để bot đọc đúng theo kịch bản.',
  parameters: {
    type: 'object',
    properties: {
      scenario: {
        type: 'string',
        enum: ['AUTO', 'SMARTBANKING_LOGIN', 'CARD_GNND'],
        description: 'AUTO = tự chọn nhóm vấn đề; hoặc chỉ định nhóm.',
      },
      userProblem: {
        type: 'string',
        description: 'Mô tả vấn đề/triệu chứng khách hàng nói',
      },
    },
    required: ['scenario', 'userProblem'],
    additionalProperties: false,
  },
  execute: async (args: any, runContext?: any) => {
    const { scenario, userProblem } = args as { scenario: BidvToolScenario; userProblem: string };
    const ctx = (runContext?.context as any) ?? undefined;
    const addressing = updateLockedAddressing(userProblem, ctx);

    const candidates = scenario === 'AUTO' ? bidvKbItems : bidvKbItems.filter((i) => i.scenario === scenario);
    // --- SOTA-ish approach in this repo: embeddings (server) + LLM rerank with json_schema ---
    // 1) Retrieve topK candidates via embeddings on server (no API key in browser).
    // 2) Ask a strong model to pick the best candidate (or ask a clarifying question),
    //    enforced via json_schema.
    // 3) Fallback to local lexical ranking if server retrieval/LLM fails.

    type Retrieved = { id: string; cause: string; guidance: string; score: number };
    let retrieved: Retrieved[] | null = null;

    try {
      // Embedding retrieval is only available when scenario is specified.
      if (scenario !== 'AUTO') {
        const res = await fetch('/api/bidv/kb/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario, query: userProblem, topK: 5 }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.ok && Array.isArray(data.results)) {
            retrieved = data.results as Retrieved[];
          }
        }
      }
    } catch {
      // ignore, fallback below
    }

    const lexicalTop = topKLexical(userProblem, candidates, 5);
    const topCandidates = (retrieved?.length ? retrieved : lexicalTop.map((c) => ({
      id: c.id,
      cause: c.cause,
      guidance: c.guidance,
      score: 0,
    }))) as Retrieved[];

    // Ask model to choose among candidates or ask to clarify.
    // We use /api/responses with json_schema so it can't hallucinate an id.
    try {
      const schema = {
        name: 'bidv_kb_lookup',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            selectedId: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            rationale: { type: 'string' },
            followUpQuestion: { type: 'string' },
          },
          required: ['found', 'selectedId', 'confidence', 'rationale', 'followUpQuestion'],
        },
      };

      const resp = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4.1',
          input: [
            {
              role: 'system',
              content:
                'You are a retrieval reranker for a Vietnamese bank support KB. Choose the single best KB item for the user problem. ' +
                'You MUST select an id from the provided candidates if any fits. If none fits confidently, set found=false and ask ONE concise follow-up question. ' +
                'Never invent ids. Keep followUpQuestion in Vietnamese and voice-friendly.',
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  scenario,
                  userProblem,
                  candidates: topCandidates.map((c) => ({
                    id: c.id,
                    cause: c.cause,
                    guidance: c.guidance,
                    retrievalScore: c.score,
                  })),
                },
                null,
                2,
              ),
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              json_schema: schema,
            },
          },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const parsed = data?.output_parsed as {
          found: boolean;
          selectedId: string;
          confidence: 'high' | 'medium' | 'low';
          rationale: string;
          followUpQuestion: string;
        };

        if (parsed?.found) {
          const picked = candidates.find((c) => c.id === parsed.selectedId);
          if (picked) {
            return {
              found: true,
              id: picked.id,
              scenario: picked.scenario,
              cause: picked.cause,
              guidance: picked.guidance,
              steps: (picked.steps ?? []).map((s) => ({ ...s, text: renderTemplate(s.text, addressing) })),
              confidence: parsed.confidence === 'high' ? 'high' : 'medium',
              debugTop: topCandidates.map((c) => ({ id: c.id, score: c.score, cause: c.cause })),
            };
          }
        } else if (parsed && typeof parsed.followUpQuestion === 'string' && parsed.followUpQuestion.trim()) {
          return {
            found: false,
            message: parsed.followUpQuestion.trim(),
            candidates: candidates.map((c) => ({ id: c.id, cause: c.cause })),
          };
        }
      }
    } catch {
      // ignore, fallback below
    }

    // --- Fallback: local lexical ranking ---
    const docs = buildDocIndex(candidates);
    const ranked = bm25Score(userProblem, docs).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || (best.score ?? 0) <= 0) {
      return {
        found: false,
        message:
          'Chưa tìm thấy hướng dẫn khớp chính xác. Mình cho em xin thêm thông báo lỗi hiển thị hoặc anh đang bị lỗi ở bước nào được không ạ?',
        candidates: candidates.map((c) => ({ id: c.id, cause: c.cause })),
      };
    }

    return {
      found: true,
      id: best.doc.id,
      scenario: candidates.find((c) => c.id === best.doc.id)?.scenario,
      cause: best.doc.cause,
      guidance: best.doc.guidance,
      steps: (best.doc.steps ?? []).map((s) => ({ ...s, text: renderTemplate(s.text, addressing) })),
      confidence: best.score >= 2 ? 'high' : 'medium',
      debugTop: ranked.slice(0, 3).map((r) => ({ id: r.doc.id, score: r.score, cause: r.doc.cause })),
    };
  },
});

export const createTicketTool = tool({
  name: 'createTicket',
  description:
    'Tạo ticket để chuyển tư vấn viên liên hệ lại (khi khách chưa xử lý được/không hài lòng/bot không hiểu hoặc câu hỏi ngoài tri thức).',
  parameters: {
    type: 'object',
    properties: {
      issue: {
        type: 'string',
        description: 'Vấn đề cần hỗ trợ (tóm tắt ngắn gọn 1–2 câu)',
      },
      customerFullName: {
        type: 'string',
        description: 'Họ và tên đầy đủ của khách hàng',
      },
      phoneNumber: {
        type: 'string',
        description: 'Số điện thoại liên hệ',
      },
      category: {
        type: 'string',
        enum: ['SMARTBANKING_LOGIN', 'CARD_GNND', 'OTHER_BIDV_NOT_IN_DOC', 'OUT_OF_SCOPE'],
        description: 'Phân loại ticket',
      },
      riskFlag: {
        type: 'string',
        enum: ['HIGH', 'NORMAL'],
        description: 'Đánh dấu rủi ro cao hay bình thường',
      },
      notes: {
        type: 'string',
        description: 'Ghi chú thêm: thông báo lỗi, bước đang bị lỗi, đã thử gì...',
      },
    },
    required: ['issue', 'customerFullName', 'phoneNumber', 'category', 'riskFlag'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { issue, customerFullName, phoneNumber, category, riskFlag, notes } = args as {
      issue: string;
      customerFullName: string;
      phoneNumber: string;
      category: string;
      riskFlag: 'HIGH' | 'NORMAL';
      notes?: string;
    };

    const ticketId = `BIDV-${Date.now()}`;
    const timestamp = new Date().toISOString();

    console.log('[BIDV Bot] Ticket created', {
      ticketId,
      timestamp,
      category,
      riskFlag,
      customerFullName,
      phoneNumber,
      issue,
      notes,
    });

    return {
      success: true,
      ticketId,
      timestamp,
      summary: {
        ticketId,
        category,
        riskFlag,
        customerFullName,
        phoneNumber,
        issue,
        notes: notes || '',
      },
    };
  },
});
