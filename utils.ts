import * as parquet from '@dsnp/parquetjs';
import fs from 'fs';
import path from 'path';
import { Tiktoken } from 'js-tiktoken/lite';
import o200k_base from 'js-tiktoken/ranks/o200k_base';
import { ChatRecord, ClusterEntry, ClusterTable } from './types';

export interface ConversationMessage {
  role?: string;
  content?: string;
  [k: string]: any;
}



function unwrapParquetLists(obj: any): any {
  if (Array.isArray(obj)) return obj.map(unwrapParquetLists);
  if (obj && typeof obj === 'object') {
    if ((obj as any).list && Array.isArray((obj as any).list)) {
      return (obj as any).list.map((e: any) => {
        const el = e && typeof e === 'object' && 'element' in e ? (e as any).element : e;
        return unwrapParquetLists(el);
      });
    }
    for (const k of Object.keys(obj)) {
      (obj as any)[k] = unwrapParquetLists((obj as any)[k]);
    }
  }
  return obj;
}

export function safeJSONParse<T = any>(raw: string): { ok: true; value: T } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch (e) {
    return { ok: false, error: e as Error };
  }
}

export function normalizeConversation(chat: ChatRecord): string {
  return chat.conversation
    .map((m, i) => {
      let role: string;
      if (m.role) {
        const r = m.role.toLowerCase();
        role = r === 'assistant' || r === 'ai' || r === 'model' ? 'AI' : 'User';
      } else {
        role = i % 2 === 0 ? 'User' : 'AI';
      }
      return `${role}: ${m.content}`;
    })
    .join('\n');
}

export function extractClusters(obj: ClusterTable | null): ClusterEntry[] | null {
  if (!obj) return null;
  return obj.updatedTable ?? [];
}

export async function readParquetFile(filePath: string, recordLimit: number | null = null): Promise<ChatRecord[]> {
  const allRecords: ChatRecord[] = [];
  try {
    const reader = await (parquet as any).ParquetReader.openFile(filePath);
    const cursor = reader.getCursor();
    let record: any;
    while ((record = await cursor.next())) {
      const unwrapped = unwrapParquetLists(record.conversation);
      record.conversation = unwrapped;
      allRecords.push(record);
      if (recordLimit && allRecords.length >= recordLimit) break;
    }
    await reader.close();
  } catch (error: any) {
    console.error('Error reading Parquet file:', error);
  }
  return allRecords;
}

export async function getParquetFiles(recordLimit: number | null = null): Promise<ChatRecord[]> {
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), 'data');
  if (process.env.DEBUG_PATHS) {
    console.log('[paths] DATA_DIR resolved to', dataDir);
  }
  if (!fs.existsSync(dataDir)) {
    console.error('Data directory does not exist:', dataDir);
    return [];
  }
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.parquet'));
  if (files.length === 0) {
    console.error('No parquet files found in the data directory.');
    return [];
  }
  let allRows: ChatRecord[] = [];
  for (const file of files) {
    const fullPath = path.join(dataDir, file);
    try {
      const fileData = await readParquetFile(fullPath, recordLimit);
      console.log(`Loaded ${fullPath}`);
      console.log(`${fileData.length} rows`);
      allRows = allRows.concat(fileData);
    } catch (err: any) {
      console.error('Failed to read parquet file', file, err.message || err);
    }
  }
  console.log(`Aggregated ${allRows.length} rows from ${files.length} parquet file(s).`);
  return allRows;
}

export function splitIntoBatches<T>(arr: T[], batchCount: number): T[][] {
  if (!Number.isInteger(batchCount) || batchCount <= 0) throw new Error('batchCount must be a positive integer');
  const n = Math.min(batchCount, arr.length);
  const base = Math.floor(arr.length / n);
  let remainder = arr.length % n;
  const batches: T[][] = [];
  let index = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    batches.push(arr.slice(index, index + size));
    index += size;
  }
  return batches;
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function summariesToMarkdown(items: { id?: string; conversation_hash?: string; summary?: string }[]): string {
  return [
    '',
    ...items.map(it => `## ${it.id ?? it.conversation_hash ?? '(no id)'}\n${it.summary || '*<no summary>*'}`)
  ].join('\n');
}

let _encoding: Tiktoken | undefined;
function getEncoding(): Tiktoken {
  if (!_encoding) {
    _encoding = new Tiktoken(o200k_base as any);
  }
  return _encoding;
}

export interface TruncateOptions { addEllipsis?: boolean; returnMeta?: boolean; }
export interface TruncateMeta { text: string; originalTokenCount: number; finalTokenCount: number; truncated: boolean; }

export function truncateWithTiktoken(str: string, maxTokens: number, opts: TruncateOptions & { returnMeta: true }): TruncateMeta;
export function truncateWithTiktoken(str: string, maxTokens: number, opts?: TruncateOptions): string;
export function truncateWithTiktoken(str: string, maxTokens: number, opts: TruncateOptions = {}): string | TruncateMeta {
  const { addEllipsis = true, returnMeta = false } = opts;
  if (!str || typeof str !== 'string') return returnMeta ? { text: '', truncated: false, originalTokenCount: 0, finalTokenCount: 0 } : '';
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    return returnMeta ? { text: str, truncated: false, originalTokenCount: 0, finalTokenCount: 0 } : str;
  }
  const enc = getEncoding();
  const tokenIds = enc.encode(str);
  const over = tokenIds.length > maxTokens;
  const usedIds = over ? tokenIds.slice(0, maxTokens) : tokenIds;
  let text = enc.decode(usedIds);
  if (over && addEllipsis) text = text.trimEnd() + ' ...';
  if (returnMeta) {
    return { text, originalTokenCount: tokenIds.length, finalTokenCount: usedIds.length + (addEllipsis && over ? 1 : 0), truncated: over };
  }
  return text;
}

export function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function writeJSONLStream<T>(items: T[], filePath: string): void {
  ensureDir(path.dirname(filePath));
  const fd = fs.openSync(filePath, 'w');
  try {
    for (const it of items) {
      fs.writeSync(fd, JSON.stringify(it) + '\n');
    }
  } finally {
    fs.closeSync(fd);
  }
  console.log(`[write] JSONL stream -> ${filePath}`);
}

export const TEXT_OUTPUT_FORMAT = `# Output:\n  ## Please provide your answer between the tags: <category-id>your idenfied category id </category-id\n  <category-name>your identified category name</category-name>\n  <explanation>your explanation</explanation>\n`;

export default { 
    getParquetFiles, 
    splitIntoBatches, 
    shuffleInPlace, 
    summariesToMarkdown, 
    truncateWithTiktoken, 
    writeJSONLStream, 
    safeJSONParse,
    normalizeConversation,
    extractClusters,
    TEXT_OUTPUT_FORMAT 
};