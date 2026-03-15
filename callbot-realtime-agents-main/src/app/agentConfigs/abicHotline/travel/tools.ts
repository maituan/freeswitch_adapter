import { tool } from '@openai/agents/realtime';
import { abicTravelKbItems, type AbicTravelKbItem, type AbicTravelScope } from './travelKb';
import { abicTravelDocs, type AbicTravelDocScope } from './knowledgeSources';

type AbicToolScope = AbicTravelScope | 'AUTO';

type DocIndex = {
  id: string;
  scope: AbicTravelScope;
  title: string;
  content: string;
  source: string;
  keywords: string[];
  tf: Record<string, number>;
  len: number;
};

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

function buildDocIndex(items: AbicTravelKbItem[]): DocIndex[] {
  return items.map((it) => {
    const text = `${it.title} ${it.content} ${it.keywords.join(' ')}`.trim();
    const tokens = tokenize(text);
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
    return {
      id: it.id,
      scope: it.scope,
      title: it.title,
      content: it.content,
      source: it.source,
      keywords: it.keywords,
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

    // keyword phrase boost
    const nq = normalizeForSearch(query);
    for (const kw of d.keywords) {
      const nkw = normalizeForSearch(kw);
      if (!nkw) continue;
      if (nq.includes(nkw)) score += nkw.includes(' ') ? 4 : 2;
    }

    return { doc: d, score };
  });
}

function autoScopeHint(query: string): AbicTravelScope {
  const q = normalizeForSearch(query);
  if (/(tre chuyen|tri hoan|delay|cham chuyen|san bay|may bay|hang van chuyen|the len may bay)/.test(q)) {
    return 'TRAVEL_FLIGHT';
  }
  if (/(quoc te|ra nuoc ngoai|visa|schengen|chau au)/.test(q)) {
    return 'TRAVEL_INTERNATIONAL';
  }
  return 'TRAVEL_DOMESTIC';
}

export const lookupAbicTravelKBTool = tool({
  name: 'lookupAbicTravelKB',
  description:
    'Tra cứu tri thức bảo hiểm du lịch (trong nước/quốc tế/trễ chuyến) để trả lời đúng theo tài liệu. Trả về đoạn nội dung voice-friendly + nguồn.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Câu hỏi hoặc nhu cầu của khách hàng' },
      productScope: {
        type: 'string',
        enum: ['AUTO', 'TRAVEL_DOMESTIC', 'TRAVEL_INTERNATIONAL', 'TRAVEL_FLIGHT'],
        description: 'Nhóm phạm vi tra cứu. AUTO = tự suy luận từ query.',
      },
      topK: { type: 'number', description: 'Số kết quả tối đa (từ một đến năm)' },
    },
    required: ['query', 'productScope'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { query, productScope } = args as { query: string; productScope: AbicToolScope; topK?: number };
    const topK = Math.max(1, Math.min(5, Number(args?.topK ?? 3)));
    const inferred = productScope === 'AUTO' ? autoScopeHint(query) : productScope;

    const pool = abicTravelKbItems.filter((i) => i.scope === inferred);
    const docs = buildDocIndex(pool.length ? pool : abicTravelKbItems);
    const ranked = bm25Score(query, docs).sort((a, b) => b.score - a.score).slice(0, topK);
    const best = ranked[0];

    if (!best || (best.score ?? 0) <= 0) {
      return {
        found: false,
        scopeUsed: inferred,
        message: 'Để được tư vấn kỹ hơn về trường hợp của anh chị, em xin phép chuyển máy đến tổng đài viên ạ.',
        tag: '|FORWARD',
      };
    }

    return {
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
    };
  },
});

type DocUsageIndex = {
  docId: string;
  scope: AbicTravelDocScope;
  title: string;
  whenToUse: string;
  tf: Record<string, number>;
  len: number;
};

function buildDocUsageIndex() {
  return abicTravelDocs.map((d) => {
    const text = `${d.title} ${d.whenToUse}`.trim();
    const tokens = tokenize(text);
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
    const out: DocUsageIndex = {
      docId: d.docId,
      scope: d.scope,
      title: d.title,
      whenToUse: d.whenToUse,
      tf,
      len: tokens.length,
    };
    return out;
  });
}

function bm25ScoreDocs(query: string, docs: DocUsageIndex[]) {
  const qTokens = tokenize(query);
  const df: Record<string, number> = {};
  for (const d of docs) for (const term of Object.keys(d.tf)) df[term] = (df[term] ?? 0) + 1;
  const N = docs.length || 1;
  const idf: Record<string, number> = {};
  for (const [term, n] of Object.entries(df)) idf[term] = Math.log(1 + (N - n + 0.5) / (n + 0.5));
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
    return { doc: d, score };
  });
}

function inferDocScopeFromQuery(query: string): AbicTravelDocScope | null {
  const q = normalizeForSearch(query);
  if (/(quoc te|nuoc ngoai|visa|schengen|chau au)/.test(q)) return 'TRAVEL_INTERNATIONAL';
  if (/(trong nuoc|noi dia|viet nam)/.test(q)) return 'TRAVEL_DOMESTIC';
  return null;
}

async function selectDocIdWithLLM(userText: string, docs: DocUsageIndex[]) {
  if (!docs.length) return null;
  const model =
    process.env.OPENAI_DOC_SELECTOR_MODEL ||
    process.env.OPENAI_REWRITE_MODEL ||
    'gpt-4.1-mini';

  const res = await fetch('/api/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      input: [
        {
          role: 'system',
          content:
            'Bạn là bộ chọn tài liệu. Hãy chọn đúng 1 docId phù hợp nhất theo mô tả "Khi nào thì sử dụng tài liệu này". ' +
            'Chỉ trả về docId trong danh sách được cung cấp. Không bịa.',
        },
        {
          role: 'user',
          content:
            `Câu hỏi khách hàng: ${userText}\n\n` +
            `Danh sách tài liệu:\n` +
            docs
              .map(
                (d, i) =>
                  `${i + 1}) docId=${d.docId}\nTên: ${d.title}\nKhi dùng: ${d.whenToUse}`,
              )
              .join('\n\n'),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'doc_select',
          schema: {
            type: 'object',
            properties: {
              docId: { type: 'string', enum: docs.map((d) => d.docId) },
              reason: { type: 'string' },
            },
            required: ['docId', 'reason'],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  const parsed = json?.output_parsed;
  const docId = parsed?.docId;
  if (docId && docs.some((d) => d.docId === docId)) return docId;
  return null;
}

export const selectAbicTravelKnowledgeSourceTool = tool({
  name: 'selectAbicTravelKnowledgeSource',
  description:
    'Chọn đúng tài liệu tri thức để tra cứu, dựa theo cột “Khi nào thì sử dụng tài liệu này” trong bộ tài liệu bảo hiểm du lịch.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Câu hỏi hoặc nhu cầu của khách hàng' },
      travelScope: {
        type: 'string',
        enum: ['AUTO', 'TRAVEL_INTERNATIONAL', 'TRAVEL_DOMESTIC'],
        description: 'Nếu biết rõ trong nước/quốc tế thì chỉ định; AUTO = suy luận từ query.',
      },
      topK: { type: 'number', description: 'Số tài liệu gợi ý (từ một đến ba)' },
    },
    required: ['query', 'travelScope'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { query, travelScope } = args as {
      query: string;
      travelScope: 'AUTO' | AbicTravelDocScope;
      topK?: number;
    };
    const topK = Math.max(1, Math.min(3, Number(args?.topK ?? 2)));

    const inferred = travelScope === 'AUTO' ? inferDocScopeFromQuery(query) : travelScope;
    const docs = buildDocUsageIndex().filter((d) => (inferred ? d.scope === inferred : true));
    const ranked = bm25ScoreDocs(query, docs).sort((a, b) => b.score - a.score).slice(0, topK);

    return {
      scopeUsed: inferred ?? 'AUTO',
      selected: ranked.map((r) => ({
        docId: r.doc.docId,
        title: r.doc.title,
        scope: r.doc.scope,
        whenToUse: r.doc.whenToUse,
        score: r.score,
      })),
    };
  },
});

export const searchAbicTravelKnowledgeDocTool = tool({
  name: 'searchAbicTravelKnowledgeDoc',
  description:
    'Tra cứu nội dung trong đúng tài liệu tri thức (file markdown theo docId) và trả về đoạn liên quan nhất.',
  parameters: {
    type: 'object',
    properties: {
      docId: { type: 'string', enum: ['2399', '2400', '2401', '2402', '2403', '2404'] },
      query: { type: 'string' },
      topK: { type: 'number', description: 'Số đoạn gợi ý (từ một đến năm)' },
    },
    required: ['docId', 'query'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { docId, query } = args as { docId: string; query: string; topK?: number };
    const topK = Math.max(1, Math.min(5, Number(args?.topK ?? 3)));
    const res = await fetch('/api/abic/travel/knowledge/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, query, topK, maxChars: 900 }),
    });
    if (!res.ok) {
      return { ok: false, found: false, docId, error: 'request_failed' };
    }
    return await res.json();
  },
});

type TravelType = 'TRAVEL_DOMESTIC' | 'TRAVEL_INTERNATIONAL';
type TravelState = {
  travelType?: TravelType;
  offeredWeb?: boolean;
};

function getDebugB3Mode(): 'international' | 'domestic' | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('abicTestB3');
    if (v === 'international' || v === 'domestic') return v;
    return null;
  } catch {
    return null;
  }
}

function detectTravelTypeFromText(text: string): TravelType | null {
  const q = normalizeForSearch(text);
  // IMPORTANT (happycase): "đi nước ngoài"/"đi du lịch" vẫn được xem là nhu cầu chung,
  // chưa coi như khách đã xác định rõ "quốc tế". Chỉ set type khi khách nói rõ "quốc tế".
  if (/(quoc te)/.test(q)) return 'TRAVEL_INTERNATIONAL';
  if (/(trong nuoc|noi dia|viet nam)/.test(q)) return 'TRAVEL_DOMESTIC';
  return null;
}

function containsPricingTrigger(text: string) {
  const q = normalizeForSearch(text);
  return /(gia|phi|bao gia|chi phi|giam gia|chiet khau|khuyen mai|uu dai|mua nhu the nao|cach mua|kenh ban|co ban khong)/.test(q);
}

type SessionCtx = { agentConfig: string; sessionId: string };

async function readState(sc: SessionCtx): Promise<{ lastAgentName?: string; data?: any } | null> {
  const { agentConfig, sessionId } = sc;
  if (!sessionId) return null;
  const res = await fetch(
    `/api/state?agentConfig=${encodeURIComponent(agentConfig)}&sessionId=${encodeURIComponent(sessionId)}`
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json?.state ?? null;
}

async function patchState(sc: SessionCtx, data: Record<string, any>) {
  const { agentConfig, sessionId } = sc;
  if (!sessionId) return;
  await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentConfig, sessionId, data }),
  });

}

async function searchTravelDoc(docId: string, query: string) {
  const res = await fetch('/api/abic/travel/knowledge/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, query, topK: 1, maxChars: 900 }),
  });
  if (!res.ok) return null;
  return await res.json();
}

async function debugLog(sc: SessionCtx, event: string, data?: any) {
  try {
    const { agentConfig, sessionId } = sc;
    await fetch('/api/debug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'abicTravelNextStep',
        event,
        agentConfig,
        sessionId,
        agentName: 'abicTravelAgent',
        data,
      }),
    });
  } catch {
    // best-effort
  }
}

export const abicTravelNextStepTool = tool({
  name: 'abicTravelNextStep',
  description:
    'Policy engine cho bảo hiểm du lịch: quyết định bước tiếp theo theo happycase (B1/B2/KB) và trả về câu trả lời cuối cùng + tag. Không tự ý chuyển máy khi chưa chạm trigger.',
  parameters: {
    type: 'object',
    properties: {
      userText: { type: 'string', description: 'Nội dung khách vừa nói' },
    },
    required: ['userText'],
    additionalProperties: false,
  },
  execute: async (args: any, runContext?: any) => {
    const { userText } = args as { userText: string };
    const cd = ((runContext?.context as any)?.customData ?? {}) as Record<string, any>;
    const sc: SessionCtx = {
      agentConfig: cd.agentConfig ?? 'abicHotline',
      sessionId  : cd.sessionId  ?? '',
    };

    await debugLog(sc, 'input', { userText });

    // If the user is asking about pricing/sales, follow happycase: offer transfer (CHAT first).
    if (containsPricingTrigger(userText)) {
      await debugLog(sc, 'path', { kind: 'pricing_trigger' });
      return {
        replyText:
          'Em xin phép chuyển máy đến chuyên viên để tư vấn mức phí chi tiết theo trường hợp của mình. Anh chị có muốn em chuyển máy không ạ? |CHAT',
      };
    }

    const { sessionId } = sc;
    const debugMode = getDebugB3Mode();
    let forcedState: TravelState | null = null;
    let skipToB3 = false;
    if (debugMode && sessionId) {
      const travelType =
        debugMode === 'domestic' ? 'TRAVEL_DOMESTIC' : 'TRAVEL_INTERNATIONAL';
      forcedState = { travelType, offeredWeb: true };
      skipToB3 = true;
      // Ensure state for B3 testing
      await patchState(sc, { abicTravel: forcedState });
      await debugLog(sc, 'debug_b3', { travelType });
    }

    const snapshot = await readState(sc);
    const st = (forcedState ?? snapshot?.data?.abicTravel ?? {}) as TravelState;
    await debugLog(sc, 'state', { st });

    // Determine / update travel type if user provides it.
    const typeFromUser = detectTravelTypeFromText(userText);
    const travelType = typeFromUser ?? st.travelType ?? undefined;
    const offeredWeb = Boolean(st.offeredWeb);
    await debugLog(sc, 'computed', { typeFromUser, travelType, offeredWeb });

    // If state is inconsistent (no travelType but offeredWeb=true), reset offeredWeb
    if (!st.travelType && offeredWeb) {
      await patchState(sc, { abicTravel: { offeredWeb: false } });
      await debugLog(sc, 'patch', { offeredWeb: false, reason: 'inconsistent_state' });
    }

    // If we still don't know travel type, ask B1 (no forward).
    if (!travelType) {
      // IMPORTANT: reset offeredWeb so B2 always happens after B1
      await patchState(sc, { abicTravel: { travelType: undefined, offeredWeb: false } });
      await debugLog(sc, 'path', { kind: 'B1' });
      return {
        replyText: 'Anh chị quan tâm đến bảo hiểm du lịch trong nước hay quốc tế ạ? |CHAT',
      };
    }

    // If travel type just got set or website not offered yet -> do B2 offer website (happycase).
    const travelTypeChanged = Boolean(typeFromUser && typeFromUser !== st.travelType);
    if (!skipToB3 && (!offeredWeb || travelTypeChanged)) {
      await patchState(sc, { abicTravel: { travelType, offeredWeb: true } });
      await debugLog(sc, 'path', { kind: 'B2', travelType, travelTypeChanged });
      return {
        replyText:
          'Anh chị có thể xem chi tiết quyền lợi nhanh chóng trên trang goét A Bích chấm com chấm vi en tại mục “Sản phẩm bảo hiểm”. Anh chị có muốn tự xem trước không ạ? |CHAT',
      };
    }

    // After offering website, answer using the correct travel docs (2399/2400/2403/2401/2402/2404).
    const docScope: AbicTravelDocScope =
      travelType === 'TRAVEL_INTERNATIONAL' ? 'TRAVEL_INTERNATIONAL' : 'TRAVEL_DOMESTIC';
    const scopedDocs = buildDocUsageIndex().filter((d) => d.scope === docScope);
    // Use BM25 to shortlist, then LLM to choose based on “whenToUse”.
    const shortlisted = bm25ScoreDocs(userText, scopedDocs)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((r) => r.doc);
    const chosen = await selectDocIdWithLLM(userText, shortlisted);
    const candidates = chosen
      ? [chosen, ...shortlisted.map((d) => d.docId).filter((id) => id !== chosen)]
      : shortlisted.map((d) => d.docId);
    await debugLog(sc, 'path', { kind: 'B3', docScope, candidates, chosen });

    for (const docId of candidates) {
      const r = await searchTravelDoc(docId, userText);
      await debugLog(sc, 'doc_search', { docId, found: Boolean(r?.found), score: r?.best?.score });
      const spoken = r?.best?.spokenText;
      const raw = r?.best?.rawText;
      if (r?.found && (spoken || raw)) {
        return {
          replyText: `${spoken || raw}\n\nAnh chị cần em làm rõ thêm phần nào không ạ? |CHAT`,
        };
      }
    }

    // Fallback: minimal Phase-1 KB items (happycase subset).
    const inferred = autoScopeHint(userText);
    const pool = abicTravelKbItems.filter((i) => i.scope === inferred);
    const docs = buildDocIndex(pool.length ? pool : abicTravelKbItems);
    const ranked = bm25Score(userText, docs).sort((a, b) => b.score - a.score).slice(0, 1);
    const best = ranked[0];
    if (best?.doc?.content) {
      return { replyText: `${best.doc.content}\n\nAnh chị cần làm rõ thêm thông tin gì không ạ? |CHAT` };
    }

    await debugLog(sc, 'path', { kind: 'FORWARD_fallback' });
    return {
      replyText: 'Để được tư vấn kỹ hơn về trường hợp của anh chị, em xin phép chuyển máy đến tổng đài viên ạ. |FORWARD',
    };
  },
});

