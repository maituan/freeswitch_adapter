import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import OpenAI from 'openai';

const repoRoot = process.cwd();
const knowledgeDir = path.join(repoRoot, 'src/app/agentConfigs/abicHotline/travel/knowledge');
const indexDir = path.join(knowledgeDir, 'index');

const DOC_IDS = ['2399', '2400', '2401', '2402', '2403', '2404'];

const model = process.env.OPENAI_REWRITE_MODEL || 'gpt-4.1-mini';

function normalizeForSearch(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s) {
  const n = normalizeForSearch(s);
  if (!n) return [];
  return n.split(' ').filter(Boolean);
}

function splitIntoChunks(md, maxChars = 700) {
  const text = String(md ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return [];
  const paras = text.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
  const chunks = [];

  for (const para of paras) {
    if (para.length <= maxChars) {
      chunks.push(para);
      continue;
    }
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
  return chunks;
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function rewriteChunk(openai, userQuery, mdText) {
  const response = await openai.responses.create({
    model,
    temperature: 0.2,
    max_output_tokens: 300,
    input: [
      {
        role: 'system',
        content:
          'Bạn là trợ lý viết lại nội dung bảo hiểm sang văn nói tiếng Việt. ' +
          'Nhiệm vụ: tổng hợp ngắn gọn, rõ ràng, dễ nghe, không dùng markdown, không bảng. ' +
          'Nếu có bảng/điều khoản, hãy chuyển thành câu với nhãn và giá trị. ' +
          'Không bịa thêm thông tin, không thay đổi số liệu. ' +
          'Không nhắc "theo bảng" hay "theo tài liệu".',
      },
      {
        role: 'user',
        content:
          `Ngữ cảnh câu hỏi: ${userQuery}\n\n` +
          `Nội dung nguồn (markdown):\n${mdText}\n\n` +
          'Hãy viết lại thành văn nói (1-2 đoạn), chỉ trả lại nội dung đã tổng hợp.',
      },
    ],
    stream: false,
  });

  const output = response.output ?? [];
  const messages = output.filter((o) => o?.type === 'message');
  let text = '';
  for (const msg of messages) {
    const content = Array.isArray(msg?.content) ? msg.content : [];
    for (const c of content) {
      if (c?.type === 'output_text' || c?.type === 'text') {
        if (typeof c.text === 'string') text += c.text;
      }
    }
  }
  return text.trim();
}

async function loadExistingIndex(docId) {
  try {
    const p = path.join(indexDir, `${docId}.json`);
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY. Aborting.');
    process.exit(1);
  }

  await fs.mkdir(indexDir, { recursive: true });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (const docId of DOC_IDS) {
    const mdPath = path.join(knowledgeDir, `${docId}.md`);
    const md = await fs.readFile(mdPath, 'utf8');
    const chunks = splitIntoChunks(md, 700);
    const existing = await loadExistingIndex(docId);
    const existingMap = new Map(
      (existing?.chunks ?? []).map((c) => [c.rawHash, c]),
    );

    const outChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const rawText = chunks[i];
      const rawHash = hashText(rawText);
      const prev = i > 0 ? chunks[i - 1] : '';
      const overlapPrefix = prev ? prev.slice(-120) : '';
      const searchText = overlapPrefix ? `${overlapPrefix}\n${rawText}` : rawText;

      const cached = existingMap.get(rawHash);
      let spokenText = cached?.spokenText ?? '';

      if (!spokenText) {
        const queryHint = `Tài liệu ${docId}`;
        spokenText = await rewriteChunk(openai, queryHint, rawText);
      }

      const tokens = tokenize(searchText);
      const tf = {};
      for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;

      outChunks.push({
        id: String(i),
        rawText,
        rawHash,
        searchText,
        spokenText,
        tf,
        len: tokens.length,
      });

      process.stdout.write(`doc ${docId} chunk ${i + 1}/${chunks.length}\r`);
    }
    process.stdout.write('\n');

    const out = {
      docId,
      builtAt: new Date().toISOString(),
      model,
      chunks: outChunks,
    };

    await fs.writeFile(
      path.join(indexDir, `${docId}.json`),
      JSON.stringify(out, null, 2),
      'utf8',
    );
    console.log(`Wrote index ${docId}.json (${outChunks.length} chunks)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

