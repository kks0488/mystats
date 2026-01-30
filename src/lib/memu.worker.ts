/// <reference lib="webworker" />
export {};

type JournalEntryLite = {
  id: string;
  content: string;
  timestamp: number;
  type: string;
  lastModified?: number;
};

type MemuRetrieveItem = {
  id: string;
  summary: string;
  memory_type: string;
  user_id: string;
  score?: number;
  created_at?: string;
  updated_at?: string;
};

type RetrieveRequest = {
  id: string;
  type: 'retrieve';
  query: string;
  entries: JournalEntryLite[];
  userId: string;
  topK: number;
};

type CheckSimilarRequest = {
  id: string;
  type: 'checkSimilar';
  content: string;
  entries: JournalEntryLite[];
  userId: string;
  threshold: number;
};

type WorkerRequest = RetrieveRequest | CheckSimilarRequest;

type RetrieveResponse = {
  id: string;
  ok: true;
  type: 'retrieve';
  items: MemuRetrieveItem[];
};

type CheckSimilarResponse = {
  id: string;
  ok: true;
  type: 'checkSimilar';
  is_similar: boolean;
  similarity_score: number;
  similar_items: Array<{ id: string; summary: string; score: number; memory_type: string }>;
};

type WorkerError = { id: string; ok: false; error: string };

const MAX_CONTENT_CHARS = 8000;
const EMBED_DIM = 512;
const MIN_TOKEN_LEN = 2;
const EMBED_CACHE_MAX_ITEMS = 2500;

type EmbeddedVecCacheEntry = { signature: number; vec: Float32Array };
const embeddedVecCache = new Map<string, EmbeddedVecCacheEntry>();

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

function getEntrySignature(entry: JournalEntryLite): number {
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

function getEntryVec(entry: JournalEntryLite): Float32Array {
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

function handleRetrieve(req: RetrieveRequest): RetrieveResponse {
  const qVec = embedText(req.query);
  const scored: MemuRetrieveItem[] = [];
  for (const entry of req.entries) {
    const score = cosineSimilarity(qVec, getEntryVec(entry));
    scored.push({
      id: entry.id,
      summary: (entry.content || '').slice(0, 2000),
      memory_type: entry.type,
      user_id: req.userId,
      score,
      created_at: new Date(entry.timestamp).toISOString(),
      updated_at: entry.lastModified ? new Date(entry.lastModified).toISOString() : undefined,
    });
  }
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return { id: req.id, ok: true, type: 'retrieve', items: scored.slice(0, Math.max(1, req.topK || 5)) };
}

function handleCheckSimilar(req: CheckSimilarRequest): CheckSimilarResponse {
  const targetVec = embedText(req.content);
  let maxScore = 0;
  const similar: CheckSimilarResponse['similar_items'] = [];

  for (const entry of req.entries) {
    const score = cosineSimilarity(targetVec, getEntryVec(entry));
    if (score > maxScore) maxScore = score;
    if (score >= req.threshold) {
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
    id: req.id,
    ok: true,
    type: 'checkSimilar',
    is_similar: top.length > 0,
    similarity_score: maxScore,
    similar_items: top,
  };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (!req || typeof req !== 'object') return;
    if (req.type === 'retrieve') {
      const res = handleRetrieve(req);
      self.postMessage(res);
      return;
    }
    if (req.type === 'checkSimilar') {
      const res = handleCheckSimilar(req);
      self.postMessage(res);
      return;
    }
    const unknown: WorkerError = { id: (req as { id?: string }).id || 'unknown', ok: false, error: 'Unknown request' };
    self.postMessage(unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker error';
    const res: WorkerError = { id: (req as { id?: string }).id || 'unknown', ok: false, error: message };
    self.postMessage(res);
  }
};
