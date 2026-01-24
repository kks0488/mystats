import { z } from 'zod';
import { getDB, type JournalEntry } from '../db/db';
import { loadFallbackJournalEntries } from '../db/fallback';

export type MemuEngine = 'embedded' | 'api';

export interface MemuConfig {
  enabled: boolean;
  engine: MemuEngine;
  baseUrl: string;
  userId: string;
  storeJournal: boolean;
  useInStrategy: boolean;
  includeProjectRegistryInStrategy: boolean;
  dedupeBeforeStore: boolean;
  dedupeThreshold: number;
}

export interface MemuRetrieveItem {
  id: string;
  summary: string;
  memory_type: string;
  user_id: string;
  score?: number;
  created_at?: string;
  updated_at?: string;
  resource_id?: string;
}

export interface MemuRetrieveResponse {
  success: boolean;
  categories: Array<Record<string, unknown>>;
  items: MemuRetrieveItem[];
  message: string;
}

export interface MemuCheckSimilarResponse {
  is_similar: boolean;
  similarity_score: number;
  similar_items: Array<{
    id: string;
    summary: string;
    score: number;
    memory_type: string;
  }>;
  message: string;
}

const STORAGE_KEY = 'MYSTATS_MEMU_CONFIG_V1';

const DEFAULT_CONFIG: MemuConfig = {
  enabled: true,
  engine: 'embedded',
  // Prefer same-origin proxy path to avoid CORS issues in local dev.
  baseUrl: '/api/memu',
  userId: 'mystats',
  storeJournal: true,
  useInStrategy: true,
  includeProjectRegistryInStrategy: false,
  dedupeBeforeStore: true,
  dedupeThreshold: 0.92,
};

const MemuConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    engine: z.enum(['embedded', 'api']).optional(),
    baseUrl: z.string().optional(),
    userId: z.string().optional(),
    storeJournal: z.boolean().optional(),
    useInStrategy: z.boolean().optional(),
    includeProjectRegistryInStrategy: z.boolean().optional(),
    dedupeBeforeStore: z.boolean().optional(),
    dedupeThreshold: z.number().min(0).max(1).optional(),
  })
  .passthrough();

function normalizeBaseUrl(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return DEFAULT_CONFIG.baseUrl;
  return trimmed.replace(/\/+$/, '');
}

function joinUrl(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function getMemuConfig(): MemuConfig {
  const raw = safeLocalStorageGet(STORAGE_KEY);
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = MemuConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return DEFAULT_CONFIG;
    const merged: MemuConfig = { ...DEFAULT_CONFIG, ...parsed.data } as MemuConfig;
    return {
      ...merged,
      baseUrl: normalizeBaseUrl(merged.baseUrl),
      userId: (merged.userId || DEFAULT_CONFIG.userId).trim() || DEFAULT_CONFIG.userId,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function setMemuConfig(patch: Partial<MemuConfig>): MemuConfig {
  const next: MemuConfig = {
    ...getMemuConfig(),
    ...patch,
  };
  const normalized: MemuConfig = {
    ...next,
    baseUrl: normalizeBaseUrl(next.baseUrl),
    userId: (next.userId || DEFAULT_CONFIG.userId).trim() || DEFAULT_CONFIG.userId,
    dedupeThreshold: Math.min(1, Math.max(0, Number(next.dedupeThreshold ?? DEFAULT_CONFIG.dedupeThreshold))),
  };
  safeLocalStorageSet(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

const DEFAULT_TIMEOUT_MS = 6000;
const HEALTH_TIMEOUT_MS = 1500;
const MAX_CONTENT_CHARS = 8000;
const EMBED_DIM = 512;
const MIN_TOKEN_LEN = 2;

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return 'name' in error && (error as { name?: unknown }).name === 'AbortError';
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function memuHealth(config: MemuConfig = getMemuConfig()): Promise<boolean> {
  if (!config.enabled) return false;
  if (config.engine === 'embedded') return true;
  try {
    const response = await fetchWithTimeout(joinUrl(config.baseUrl, '/health'), undefined, HEALTH_TIMEOUT_MS);
    if (!response.ok) return false;
    const data = (await response.json()) as { status?: unknown };
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

export async function memuRetrieve(
  query: string,
  config: MemuConfig = getMemuConfig(),
  options?: { userId?: string; topK?: number; timeoutMs?: number }
): Promise<MemuRetrieveResponse | null> {
  if (!config.enabled) return null;
  if (config.engine === 'embedded') {
    return await embeddedRetrieve(query, config, options);
  }
  const userId = (options?.userId || config.userId).trim() || config.userId;
  const topK = Math.max(1, Number(options?.topK ?? 5));
  const timeoutMs = Math.max(500, Number(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  try {
    const response = await fetchWithTimeout(
      joinUrl(config.baseUrl, '/retrieve'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, user_id: userId, top_k: topK }),
      },
      timeoutMs
    );
    if (!response.ok) return null;
    return (await response.json()) as MemuRetrieveResponse;
  } catch (error) {
    if (isAbortError(error)) return null;
    return null;
  }
}

export async function memuCheckSimilar(
  content: string,
  config: MemuConfig = getMemuConfig(),
  options?: { threshold?: number; userId?: string; timeoutMs?: number }
): Promise<MemuCheckSimilarResponse | null> {
  if (!config.enabled) return null;
  if (config.engine === 'embedded') {
    return await embeddedCheckSimilar(content, config, options);
  }
  const userId = (options?.userId || config.userId).trim() || config.userId;
  const threshold = Math.min(1, Math.max(0, Number(options?.threshold ?? config.dedupeThreshold)));
  const timeoutMs = Math.max(500, Number(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const payload = {
    content: content.slice(0, MAX_CONTENT_CHARS),
    user_id: userId,
    threshold,
  };

  try {
    const response = await fetchWithTimeout(
      joinUrl(config.baseUrl, '/check-similar'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      timeoutMs
    );
    if (!response.ok) return null;
    return (await response.json()) as MemuCheckSimilarResponse;
  } catch (error) {
    if (isAbortError(error)) return null;
    return null;
  }
}

export async function memuCreateItem(
  content: string,
  config: MemuConfig = getMemuConfig(),
  options?: { memoryType?: string; userId?: string; timeoutMs?: number }
): Promise<string | null> {
  if (!config.enabled) return null;
  if (config.engine === 'embedded') return null;
  const userId = (options?.userId || config.userId).trim() || config.userId;
  const memoryType = (options?.memoryType || 'journal').trim() || 'journal';
  const timeoutMs = Math.max(500, Number(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS));

  const payload = {
    content: content.slice(0, MAX_CONTENT_CHARS),
    memory_type: memoryType,
    user_id: userId,
    metadata: {},
  };

  try {
    const response = await fetchWithTimeout(
      joinUrl(config.baseUrl, '/items'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      timeoutMs
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { success?: boolean; item?: { id?: string } };
    if (!data?.success) return null;
    return data.item?.id || null;
  } catch (error) {
    if (isAbortError(error)) return null;
    return null;
  }
}

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= MIN_TOKEN_LEN);
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function embedText(text: string): Float32Array {
  const clipped = (text || '').slice(0, MAX_CONTENT_CHARS);
  const vec = new Float32Array(EMBED_DIM);
  const tokens = tokenize(clipped);
  for (const token of tokens) {
    const h = fnv1a32(token);
    const idx = h % EMBED_DIM;
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  let norm = 0;
  for (let i = 0; i < vec.length; i += 1) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i += 1) {
      vec[i] /= norm;
    }
  }
  return vec;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

async function loadEmbeddedJournalEntries(): Promise<JournalEntry[]> {
  try {
    const db = await getDB();
    return await db.getAll('journal');
  } catch {
    return loadFallbackJournalEntries();
  }
}

async function embeddedRetrieve(
  query: string,
  config: MemuConfig,
  options?: { userId?: string; topK?: number; timeoutMs?: number }
): Promise<MemuRetrieveResponse> {
  const requestedUserId = (options?.userId || config.userId).trim() || config.userId;
  if (requestedUserId !== config.userId) {
    return { success: true, categories: [], items: [], message: 'No items (scope mismatch)' };
  }
  if (!config.storeJournal) {
    return { success: true, categories: [], items: [], message: 'No items (journal disabled)' };
  }

  const topK = Math.max(1, Number(options?.topK ?? 5));
  const entries = await loadEmbeddedJournalEntries();
  if (!entries.length) {
    return { success: true, categories: [], items: [], message: 'No journal entries' };
  }

  const qVec = embedText(query);
  const scored: MemuRetrieveItem[] = [];
  for (const entry of entries) {
    const score = cosineSimilarity(qVec, embedText(entry.content));
    scored.push({
      id: entry.id,
      summary: (entry.content || '').slice(0, 2000),
      memory_type: entry.type,
      user_id: config.userId,
      score,
      created_at: new Date(entry.timestamp).toISOString(),
      updated_at: entry.lastModified ? new Date(entry.lastModified).toISOString() : undefined,
    });
  }

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const items = scored.slice(0, topK);
  return { success: true, categories: [], items, message: `Found ${items.length} items (embedded)` };
}

async function embeddedCheckSimilar(
  content: string,
  config: MemuConfig,
  options?: { threshold?: number; userId?: string; timeoutMs?: number }
): Promise<MemuCheckSimilarResponse> {
  const requestedUserId = (options?.userId || config.userId).trim() || config.userId;
  if (requestedUserId !== config.userId) {
    return { is_similar: false, similarity_score: 0, similar_items: [], message: 'No items (scope mismatch)' };
  }
  if (!config.storeJournal) {
    return { is_similar: false, similarity_score: 0, similar_items: [], message: 'No items (journal disabled)' };
  }

  const threshold = Math.min(1, Math.max(0, Number(options?.threshold ?? config.dedupeThreshold)));
  const entries = await loadEmbeddedJournalEntries();
  if (!entries.length) {
    return { is_similar: false, similarity_score: 0, similar_items: [], message: 'No journal entries' };
  }

  const targetVec = embedText(content);
  let maxScore = 0;
  const similar: MemuCheckSimilarResponse['similar_items'] = [];

  for (const entry of entries) {
    const score = cosineSimilarity(targetVec, embedText(entry.content));
    if (score > maxScore) maxScore = score;
    if (score >= threshold) {
      similar.push({
        id: entry.id,
        summary: (entry.content || '').slice(0, 200),
        score,
        memory_type: entry.type,
      });
    }
  }

  similar.sort((a, b) => b.score - a.score);
  const top = similar.slice(0, 5);
  return {
    is_similar: top.length > 0,
    similarity_score: maxScore,
    similar_items: top,
    message: top.length ? `Found ${top.length} similar items (embedded)` : 'No similar content found (embedded)',
  };
}
