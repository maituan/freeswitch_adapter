import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());
const inputCsv = path.join(
  repoRoot,
  'docs/abic/ABIC - GenAI OpenAI SDK - Tài liệu BH du lịch.csv',
);
const outDir = path.join(repoRoot, 'src/app/agentConfigs/abicHotline/travel/knowledge');

function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      // Trim trailing \r from Windows line endings
      row = row.map((c) => (typeof c === 'string' ? c.replace(/\r$/, '') : c));
      // Skip empty rows
      if (row.some((c) => String(c).trim().length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }

  // Flush last field/row if file doesn't end with newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    row = row.map((c) => (typeof c === 'string' ? c.replace(/\r$/, '') : c));
    if (row.some((c) => String(c).trim().length > 0)) rows.push(row);
  }

  return rows;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function extractDocId(title) {
  const m = String(title ?? '').match(/^\s*(\d{4})\s*-/);
  return m ? m[1] : null;
}

function normalizeMdContent(content) {
  return String(content ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function main() {
  const csvText = fs.readFileSync(inputCsv, 'utf8');
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error('CSV appears empty or invalid.');

  const header = rows[0].map((h) => h.trim());
  const idxTitle = header.findIndex((h) => /tên tài liệu/i.test(h));
  const idxContent = header.findIndex((h) => /nội dung tài liệu/i.test(h));

  if (idxTitle < 0 || idxContent < 0) {
    throw new Error(`Could not find required columns in header: ${header.join(' | ')}`);
  }

  ensureDir(outDir);

  /** @type {string[]} */
  const written = [];

  for (const row of rows.slice(1)) {
    const title = row[idxTitle];
    const docId = extractDocId(title);
    if (!docId) continue;

    const content = normalizeMdContent(row[idxContent]);
    const outPath = path.join(outDir, `${docId}.md`);
    fs.writeFileSync(outPath, content + '\n', 'utf8');
    written.push(`${docId} -> ${path.relative(repoRoot, outPath)}`);
  }

  written.sort();
  console.log(`Wrote ${written.length} markdown files to ${path.relative(repoRoot, outDir)}`);
  for (const line of written) console.log(`- ${line}`);
}

main();

