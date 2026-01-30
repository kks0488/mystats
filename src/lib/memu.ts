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

// --- memU v3 API types ---

export type MemuRetrieveMethod = 'rag' | 'llm';

export interface MemuMemorizeRequest {
  conversation: Array<{ role: string; content: string }>;
  user_name?: string;
  agent_name?: string;
}

export interface MemuMemorizeResponse {
  success: boolean;
  task_id?: string;
  message: string;
}

export interface MemuMemorizeStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  message?: string;
}

export interface MemuCategory {
  name: string;
  description?: string;
  item_count?: number;
}

export interface MemuCategoriesResponse {
  success: boolean;
  categories: MemuCategory[];
  message: string;
}

export interface MemuRetrieveV3Options {
  userId?: string;
  topK?: number;
  method?: MemuRetrieveMethod;
  timeoutMs?: number;
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
const EMBED_CACHE_MAX_ITEMS = 2500;

type EmbeddedVecCacheEntry = { signature: number; vec: Float32Array };
const embeddedVecCache = new Map<string, EmbeddedVecCacheEntry>();

type EmbeddedWorkerResponse =
  | { id: string; ok: false; error: string }
  | { id: string; ok: true; type: 'retrieve'; items: MemuRetrieveItem[] }
  | {
      id: string;
      ok: true;
      type: 'checkSimilar';
      is_similar: boolean;
      similarity_score: number;
      similar_items: MemuCheckSimilarResponse['similar_items'];
    };

let embeddedWorker: Worker | null = null;
let embeddedWorkerDisabled = false;
const embeddedWorkerPending = new Map<string, { resolve: (value: EmbeddedWorkerResponse) => void; timeoutId: number }>();

function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function getEmbeddedWorker(): Worker | null {
  if (embeddedWorkerDisabled) return null;
  if (embeddedWorker) return embeddedWorker;
  if (typeof Worker === 'undefined') return null;
  try {
    embeddedWorker = new Worker(new URL('./memu.worker.ts', import.meta.url), { type: 'module' });
    embeddedWorker.onmessage = (event: MessageEvent<EmbeddedWorkerResponse>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      const pending = embeddedWorkerPending.get(msg.id);
      if (!pending) return;
      window.clearTimeout(pending.timeoutId);
      embeddedWorkerPending.delete(msg.id);
      pending.resolve(msg);
    };
    embeddedWorker.onerror = () => {
      embeddedWorkerDisabled = true;
      embeddedWorker?.terminate();
      embeddedWorker = null;
      for (const [id, pending] of embeddedWorkerPending.entries()) {
        window.clearTimeout(pending.timeoutId);
        pending.resolve({ id, ok: false, error: 'Worker error' });
      }
      embeddedWorkerPending.clear();
    };
    return embeddedWorker;
  } catch {
    embeddedWorkerDisabled = true;
    embeddedWorker = null;
    return null;
  }
}

async function runEmbeddedWorker(
  payload: { id: string; [key: string]: unknown },
  timeoutMs: number,
): Promise<EmbeddedWorkerResponse | null> {
  const worker = getEmbeddedWorker();
  if (!worker) return null;
  const id = payload.id;
  return await new Promise<EmbeddedWorkerResponse>((resolve) => {
    const safeTimeoutMs = Math.max(200, Number(timeoutMs || DEFAULT_TIMEOUT_MS));
    const timeoutId = window.setTimeout(() => {
      embeddedWorkerPending.delete(id);
      resolve({ id, ok: false, error: 'Worker timeout' });
    }, safeTimeoutMs);
    embeddedWorkerPending.set(id, { resolve, timeoutId });
    worker.postMessage(payload);
  });
}

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

function getEntrySignature(entry: JournalEntry): number {
  return Number(entry.lastModified ?? entry.timestamp ?? 0);
}

function cacheSet(key: string, value: EmbeddedVecCacheEntry): void {
  embeddedVecCache.set(key, value);
  while (embeddedVecCache.size > EMBED_CACHE_MAX_ITEMS) {
    const oldestKey = embeddedVecCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    embeddedVecCache.delete(oldestKey);
  }
}

function getEntryVec(entry: JournalEntry): Float32Array {
  const key = entry.id;
  const signature = getEntrySignature(entry);
  const existing = embeddedVecCache.get(key);
  if (existing && existing.signature === signature) {
    return existing.vec;
  }
  const vec = embedText(entry.content);
  cacheSet(key, { signature, vec });
  return vec;
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
  const timeoutMs = Math.max(200, Number(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const entries = await loadEmbeddedJournalEntries();
  if (!entries.length) {
    return { success: true, categories: [], items: [], message: 'No journal entries' };
  }

  const worker = getEmbeddedWorker();
  if (worker) {
    const res = await runEmbeddedWorker(
      {
        id: createRequestId(),
        type: 'retrieve',
        query,
        entries,
        userId: config.userId,
        topK,
      },
      timeoutMs
    );
    if (res?.ok && 'type' in res && res.type === 'retrieve') {
      return { success: true, categories: [], items: res.items, message: `Found ${res.items.length} items (embedded)` };
    }
  }

  const qVec = embedText(query);
  const scored: MemuRetrieveItem[] = [];
  for (const entry of entries) {
    const score = cosineSimilarity(qVec, getEntryVec(entry));
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
  const timeoutMs = Math.max(200, Number(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const entries = await loadEmbeddedJournalEntries();
  if (!entries.length) {
    return { is_similar: false, similarity_score: 0, similar_items: [], message: 'No journal entries' };
  }

  const worker = getEmbeddedWorker();
  if (worker) {
    const res = await runEmbeddedWorker(
      {
        id: createRequestId(),
        type: 'checkSimilar',
        content,
        entries,
        userId: config.userId,
        threshold,
      },
      timeoutMs
    );
    if (res?.ok && 'type' in res && res.type === 'checkSimilar') {
      return {
        is_similar: res.is_similar,
        similarity_score: res.similarity_score,
        similar_items: res.similar_items,
        message: res.is_similar ? `Found ${res.similar_items.length} similar items (embedded)` : 'No similar content found (embedded)',
      };
    }
  }

  const targetVec = embedText(content);
  let maxScore = 0;
  const similar: MemuCheckSimilarResponse['similar_items'] = [];

  for (const entry of entries) {
    const score = cosineSimilarity(targetVec, getEntryVec(entry));
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

// ---------------------------------------------------------------------------
// memU v3 API — additive functions (existing API untouched)
// ---------------------------------------------------------------------------

const MEMORIZE_TIMEOUT_MS = 15000;

/**
 * Store a conversation as structured memory via memU v3 memorize API.
 * Falls back gracefully — returns null when API mode is off or the call fails.
 */
export async function memuMemorize(
  conversation: MemuMemorizeRequest['conversation'],
  config: MemuConfig = getMemuConfig(),
  options?: { userName?: string; agentName?: string; timeoutMs?: number },
): Promise<MemuMemorizeResponse | null> {
  if (!config.enabled || config.engine !== 'api') return null;
  const timeoutMs = Math.max(500, Number(options?.timeoutMs ?? MEMORIZE_TIMEOUT_MS));
  const payload: MemuMemorizeRequest = {
    conversation,
    user_name: options?.userName ?? 'User',
    agent_name: options?.agentName ?? 'MyStats',
  };
  try {
    const response = await fetchWithTimeout(
      joinUrl(config.baseUrl, '/api/v3/memory/memorize'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      timeoutMs,
    );
    if (!response.ok) return null;
    return (await response.json()) as MemuMemorizeResponse;
  } catch (error) {
    if (isAbortError(error)) return null;
    return null;
  }
}

/**
 * Poll the status of a running memorize task.
 */
export async function memuMemorizeStatusCheck(
  taskId: string,
  config: MemuConfig = getMemuConfig(),
): Promise<MemuMemorizeStatus | null> {
  if (!config.enabled || config.engine !== 'api') return null;
  try {
    const response = await fetchWithTimeout(
      joinUrl(config.baseUrl, `/api/v3/memory/memorize/status/${encodeURIComponent(taskId)}`),
      undefined,
      DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    return (await response.json()) as MemuMemorizeStatus;
  } catch {
    return null;
  }
}

/**
 * Enhanced retrieve using memU v3 API with dual retrieval method support.
 * - method="rag": Fast embedding-based retrieval (sub-second).
 * - method="llm": Deep predictive reasoning (slower but more accurate).
 *
 * When running in embedded mode, falls through to the existing embeddedRetrieve.
 */
export async function memuRetrieveV3(
  query: string,
  config: MemuConfig = getMemuConfig(),
  options?: MemuRetrieveV3Options,
): Promise<MemuRetrieveResponse | null> {
  if (!config.enabled) return null;
  if (config.engine === 'embedded') {
    return await embeddedRetrieve(query, config, options);
  }
  const userId = (options?.userId || config.userId).trim() || config.userId;
  const topK = Math.max(1, Number(options?.topK ?? 5));
  const method: MemuRetrieveMethod = options?.method ?? 'rag';
  const timeoutMs = Math.max(500, Number(options?.timeoutMs ?? (method === 'llm' ? 15000 : DEFAULT_TIMEOUT_MS)));
  try {
    const response = await fetchWithTimeout(
      joinUrl(config.baseUrl, '/api/v3/memory/retrieve'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, user_id: userId, top_k: topK, method }),
      },
      timeoutMs,
    );
    if (!response.ok) {
      // Graceful fallback: try legacy endpoint
      return await memuRetrieve(query, config, options);
    }
    return (await response.json()) as MemuRetrieveResponse;
  } catch (error) {
    if (isAbortError(error)) return null;
    // Fallback to legacy retrieve on network error
    return await memuRetrieve(query, config, options);
  }
}

/**
 * Fetch auto-generated memory categories from memU v3.
 */
export async function memuCategories(
  config: MemuConfig = getMemuConfig(),
  options?: { userId?: string },
): Promise<MemuCategoriesResponse | null> {
  if (!config.enabled || config.engine !== 'api') return null;
  const userId = (options?.userId || config.userId).trim() || config.userId;
  try {
    const response = await fetchWithTimeout(
      joinUrl(config.baseUrl, '/api/v3/memory/categories'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      },
      DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    return (await response.json()) as MemuCategoriesResponse;
  } catch {
    return null;
  }
}
