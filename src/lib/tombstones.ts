export type TombstoneKind = 'journal' | 'skills' | 'solutions' | 'insights';

export type TombstoneRecord = {
  key: string;
  kind: TombstoneKind;
  id: string;
  lastModified: number;
};

const STORAGE_KEY = 'MYSTATS_TOMBSTONES_V1';
const MAX_ITEMS = 1000;
const MAX_AGE_DAYS = 90;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

type StorageMode = 'local' | 'memory';

let storageMode: StorageMode = 'local';
let warned = false;
let memoryRaw: string | null = null;

const markMemoryMode = (error?: unknown) => {
  if (storageMode !== 'memory') {
    storageMode = 'memory';
    if (!warned) {
      console.warn('[Tombstones] LocalStorage unavailable. Using memory only.', error);
      warned = true;
    }
  }
};

const getStorageValue = (): string | null => {
  if (storageMode === 'memory') return memoryRaw;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    markMemoryMode(error);
    return memoryRaw;
  }
};

const setStorageValue = (value: string) => {
  if (storageMode === 'memory') {
    memoryRaw = value;
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch (error) {
    markMemoryMode(error);
    memoryRaw = value;
  }
};

const removeStorageValue = () => {
  if (storageMode === 'memory') {
    memoryRaw = null;
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    markMemoryMode(error);
    memoryRaw = null;
  }
};

const ALLOWED_KINDS: TombstoneKind[] = ['journal', 'skills', 'solutions', 'insights'];

function isKind(value: unknown): value is TombstoneKind {
  return typeof value === 'string' && (ALLOWED_KINDS as string[]).includes(value);
}

function toRecord(item: unknown): TombstoneRecord | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  if (!isKind(record.kind)) return null;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  const lastModifiedRaw = record.lastModified;
  const lastModified =
    typeof lastModifiedRaw === 'number' ? lastModifiedRaw : typeof lastModifiedRaw === 'string' ? Number(lastModifiedRaw) : NaN;
  if (!Number.isFinite(lastModified) || lastModified <= 0) return null;
  const id = record.id.trim();
  const kind = record.kind;
  return {
    key: `${kind}:${id}`,
    kind,
    id,
    lastModified,
  };
}

function pruneList(items: TombstoneRecord[]): TombstoneRecord[] {
  const now = Date.now();
  const minTs = now - MAX_AGE_MS;
  const map = new Map<string, TombstoneRecord>();

  for (const item of items) {
    const existing = map.get(item.key);
    if (!existing || item.lastModified > existing.lastModified) {
      map.set(item.key, item);
    }
  }

  const pruned = Array.from(map.values()).filter((item) => item.lastModified >= minTs);
  pruned.sort((a, b) => b.lastModified - a.lastModified);
  return pruned.slice(0, MAX_ITEMS);
}

function loadAllUnsafe(): TombstoneRecord[] {
  try {
    const raw = getStorageValue();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(toRecord).filter((x): x is TombstoneRecord => x !== null);
  } catch {
    return [];
  }
}

function saveAllUnsafe(items: TombstoneRecord[]): void {
  try {
    setStorageValue(JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function listTombstones(): TombstoneRecord[] {
  return pruneList(loadAllUnsafe());
}

export function getTombstone(kind: TombstoneKind, id: string): TombstoneRecord | null {
  const key = `${kind}:${(id || '').trim()}`;
  if (key.endsWith(':')) return null;
  const items = listTombstones();
  return items.find((item) => item.key === key) ?? null;
}

export function upsertTombstone(kind: TombstoneKind, id: string, lastModified?: number): TombstoneRecord | null {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;
  const ts = Number.isFinite(Number(lastModified)) ? Number(lastModified) : Date.now();
  const safeTs = ts > 0 ? ts : Date.now();
  const key = `${kind}:${cleanId}`;

  const items = loadAllUnsafe();
  const existing = items.find((item) => item.key === key);
  if (existing && existing.lastModified >= safeTs) {
    return existing;
  }

  const next = pruneList([
    ...items.filter((item) => item.key !== key),
    { key, kind, id: cleanId, lastModified: safeTs },
  ]);
  saveAllUnsafe(next);
  return next.find((item) => item.key === key) ?? { key, kind, id: cleanId, lastModified: safeTs };
}

export function clearTombstones(): void {
  removeStorageValue();
}

export function pruneTombstones(): TombstoneRecord[] {
  const next = pruneList(loadAllUnsafe());
  saveAllUnsafe(next);
  return next;
}

