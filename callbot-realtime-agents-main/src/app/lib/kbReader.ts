import fs from 'fs/promises';
import path from 'path';

const KB_BASE = path.resolve(process.cwd(), 'data', 'kb');

/**
 * Resolves and validates a path within KB_BASE.
 * Throws if the resolved path escapes the KB_BASE directory (path traversal guard).
 */
function safePath(...segments: string[]): string {
  const resolved = path.resolve(KB_BASE, ...segments);
  const base = KB_BASE + path.sep;
  if (resolved !== KB_BASE && !resolved.startsWith(base)) {
    throw new Error(`Path traversal blocked: ${resolved}`);
  }
  return resolved;
}

/**
 * Reads all JSON items from data/kb/{botId}/{kbId}/.
 * Each .json file in the directory is one item.
 * Returns an empty array if the directory does not exist.
 */
export async function readKbItems<T = Record<string, unknown>>(
  botId: string,
  kbId: string,
): Promise<T[]> {
  const dir = safePath(botId, kbId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const items: T[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, entry), 'utf8');
      items.push(JSON.parse(raw) as T);
    } catch {
      // skip malformed files
    }
  }
  return items;
}

/**
 * Reads a single markdown document from data/kb/{botId}/{kbId}/{docId}.md.
 * Throws if not found.
 */
export async function readKbDocument(
  botId: string,
  kbId: string,
  docId: string,
): Promise<string> {
  const filePath = safePath(botId, kbId, `${docId}.md`);
  return fs.readFile(filePath, 'utf8');
}

/**
 * Lists the kbId directories available for a given botId.
 * Returns an empty array if the botId directory does not exist.
 */
export async function listKbSources(botId: string): Promise<string[]> {
  const dir = safePath(botId);
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * Seeds data/kb/{botId}/{kbId}/ from defaultItems if the directory is empty or missing.
 * Each item must have an `id` field used as the filename.
 * Does nothing if the directory already contains at least one .json file.
 */
export async function seedIfEmpty(
  botId: string,
  kbId: string,
  defaultItems: Array<{ id: string; [key: string]: unknown }>,
): Promise<void> {
  const dir = safePath(botId, kbId);

  let isEmpty = true;
  try {
    const entries = await fs.readdir(dir);
    if (entries.some((e) => e.endsWith('.json'))) {
      isEmpty = false;
    }
  } catch {
    // directory missing — will create below
  }

  if (!isEmpty) return;

  await fs.mkdir(dir, { recursive: true });
  await Promise.all(
    defaultItems.map((item) =>
      fs.writeFile(
        path.join(dir, `${item.id}.json`),
        JSON.stringify(item, null, 2),
        'utf8',
      ),
    ),
  );
}

/**
 * Seeds markdown documents into data/kb/{botId}/{kbId}/ from a map of docId → content.
 * Does nothing for documents that already exist on disk.
 */
export async function seedDocsIfMissing(
  botId: string,
  kbId: string,
  docs: Record<string, string>,
): Promise<void> {
  const dir = safePath(botId, kbId);
  await fs.mkdir(dir, { recursive: true });

  await Promise.all(
    Object.entries(docs).map(async ([docId, content]) => {
      const filePath = path.join(dir, `${docId}.md`);
      try {
        await fs.access(filePath);
        // file exists, skip
      } catch {
        await fs.writeFile(filePath, content, 'utf8');
      }
    }),
  );
}
