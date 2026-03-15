import fs from 'fs/promises';
import path from 'path';

const KB_BASE = path.resolve(process.cwd(), 'data', 'kb');

function safePath(...segments: string[]): string {
  const resolved = path.resolve(KB_BASE, ...segments);
  const base = KB_BASE + path.sep;
  if (resolved !== KB_BASE && !resolved.startsWith(base)) {
    throw new Error(`Path traversal blocked: ${resolved}`);
  }
  return resolved;
}

/**
 * Writes (creates or overwrites) a KB item to data/kb/{botId}/{kbId}/{item.id}.json.
 */
export async function upsertKbItem(
  botId: string,
  kbId: string,
  item: { id: string; [key: string]: unknown },
): Promise<void> {
  const dir = safePath(botId, kbId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${item.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(item, null, 2), 'utf8');
}

/**
 * Deletes data/kb/{botId}/{kbId}/{itemId}.json.
 * Throws if the file does not exist.
 */
export async function deleteKbItem(
  botId: string,
  kbId: string,
  itemId: string,
): Promise<void> {
  const filePath = safePath(botId, kbId, `${itemId}.json`);
  await fs.unlink(filePath);
}

/**
 * Reads a single item by id. Returns null if not found.
 */
export async function getKbItem<T = Record<string, unknown>>(
  botId: string,
  kbId: string,
  itemId: string,
): Promise<T | null> {
  const filePath = safePath(botId, kbId, `${itemId}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
