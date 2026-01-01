import type { JournalEntry, Skill, Insight } from './db';

const FALLBACK_KEYS = {
  journal: 'MYSTATS_FALLBACK_JOURNAL',
  skills: 'MYSTATS_FALLBACK_SKILLS',
  insights: 'MYSTATS_FALLBACK_INSIGHTS',
} as const;

type FallbackStorageMode = 'local' | 'memory';

let storageMode: FallbackStorageMode = 'local';
let warned = false;
const memoryStore: Record<string, string> = {};

const markMemoryMode = (error?: unknown) => {
  if (storageMode !== 'memory') {
    storageMode = 'memory';
    if (!warned) {
      console.warn('[Fallback] LocalStorage unavailable. Using memory only.', error);
      warned = true;
    }
  }
};

const getStorageValue = (key: string): string | null => {
  if (storageMode === 'memory') return memoryStore[key] ?? null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    markMemoryMode(error);
    return memoryStore[key] ?? null;
  }
};

const setStorageValue = (key: string, value: string) => {
  if (storageMode === 'memory') {
    memoryStore[key] = value;
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    markMemoryMode(error);
    memoryStore[key] = value;
  }
};

const removeStorageValue = (key: string) => {
  if (storageMode === 'memory') {
    delete memoryStore[key];
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch (error) {
    markMemoryMode(error);
    delete memoryStore[key];
  }
};

export const getFallbackStorageMode = () => storageMode;

const SKILL_CATEGORIES: Skill['category'][] = [
  'hard',
  'soft',
  'experience',
  'interest',
  'trait',
  'strength',
  'weakness',
];

const safeParseList = (key: string): unknown[] => {
  try {
    const raw = getStorageValue(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toJournalEntry = (item: unknown): JournalEntry | null => {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const content =
    typeof record.content === 'string'
      ? record.content
      : typeof record.text === 'string'
        ? record.text
        : typeof record.entry === 'string'
          ? record.entry
          : '';
  if (!content) return null;
  const timestampRaw = record.timestamp ?? record.createdAt;
  let timestamp =
    typeof timestampRaw === 'number'
      ? timestampRaw
      : typeof timestampRaw === 'string'
        ? new Date(timestampRaw).getTime()
        : Date.now();
  if (!Number.isFinite(timestamp)) {
    timestamp = Date.now();
  }
  const entryType: JournalEntry['type'] = record.type === 'project' ? 'project' : 'journal';
  return {
    id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
    content,
    timestamp,
    type: entryType,
    lastModified: typeof record.lastModified === 'number' ? record.lastModified : undefined,
  };
};

const toSkill = (item: unknown): Skill | null => {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) return null;
  const category = SKILL_CATEGORIES.includes(record.category as Skill['category'])
    ? (record.category as Skill['category'])
    : 'trait';
  return {
    id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
    name,
    category,
    sourceEntryIds: Array.isArray(record.sourceEntryIds)
      ? (record.sourceEntryIds.filter((id) => typeof id === 'string') as string[])
      : [],
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
    lastModified: typeof record.lastModified === 'number' ? record.lastModified : undefined,
  };
};

const toInsight = (item: unknown): Insight | null => {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  return {
    id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
    entryId: typeof record.entryId === 'string' ? record.entryId : crypto.randomUUID(),
    title: typeof record.title === 'string' ? record.title : undefined,
    content: typeof record.content === 'string' ? record.content : undefined,
    archetypes: Array.isArray(record.archetypes)
      ? (record.archetypes.filter((a) => typeof a === 'string') as string[])
      : [],
    hiddenPatterns: Array.isArray(record.hiddenPatterns)
      ? (record.hiddenPatterns.filter((p) => typeof p === 'string') as string[])
      : [],
    criticalQuestions: Array.isArray(record.criticalQuestions)
      ? (record.criticalQuestions.filter((q) => typeof q === 'string') as string[])
      : [],
    timestamp: typeof record.timestamp === 'number' ? record.timestamp : Date.now(),
    lastModified: typeof record.lastModified === 'number' ? record.lastModified : undefined,
  };
};

export const loadFallbackJournalEntries = (): JournalEntry[] => {
  return safeParseList(FALLBACK_KEYS.journal)
    .map(toJournalEntry)
    .filter((entry): entry is JournalEntry => entry !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
};

export const saveFallbackJournalEntry = (entry: JournalEntry): JournalEntry[] => {
  const existing = loadFallbackJournalEntries().filter((item) => item.id !== entry.id);
  const next = [entry, ...existing].slice(0, 200);
  setStorageValue(FALLBACK_KEYS.journal, JSON.stringify(next));
  return next;
};

export const loadFallbackSkills = (): Skill[] => {
  return safeParseList(FALLBACK_KEYS.skills)
    .map(toSkill)
    .filter((skill): skill is Skill => skill !== null);
};

export const upsertFallbackSkill = (
  skillData: { name: string; category: Skill['category'] },
  entryId?: string
): Skill[] => {
  const existing = loadFallbackSkills();
  const match = existing.find(
    (skill) => skill.name.toLowerCase() === skillData.name.toLowerCase()
  );
  if (match) {
    if (entryId && !match.sourceEntryIds.includes(entryId)) {
      match.sourceEntryIds.push(entryId);
    }
    match.lastModified = Date.now();
  } else {
    existing.push({
      id: crypto.randomUUID(),
      name: skillData.name,
      category: skillData.category,
      sourceEntryIds: entryId ? [entryId] : [],
      createdAt: Date.now(),
      lastModified: Date.now(),
    });
  }
  setStorageValue(FALLBACK_KEYS.skills, JSON.stringify(existing));
  return existing;
};

export const loadFallbackInsights = (): Insight[] => {
  return safeParseList(FALLBACK_KEYS.insights)
    .map(toInsight)
    .filter((insight): insight is Insight => insight !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
};

export const addFallbackInsight = (insight: Insight): Insight[] => {
  const existing = loadFallbackInsights().filter((item) => item.id !== insight.id);
  const next = [insight, ...existing].slice(0, 100);
  setStorageValue(FALLBACK_KEYS.insights, JSON.stringify(next));
  return next;
};

export const replaceFallbackJournalEntries = (entries: JournalEntry[]): JournalEntry[] => {
  const map = new Map<string, JournalEntry>();
  for (const item of entries) {
    const normalized = toJournalEntry(item);
    if (!normalized) continue;
    map.set(normalized.id, normalized);
  }
  const next = Array.from(map.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 200);
  setStorageValue(FALLBACK_KEYS.journal, JSON.stringify(next));
  return next;
};

export const replaceFallbackSkills = (items: Skill[]): Skill[] => {
  const map = new Map<string, { skill: Skill; sourceIds: Set<string> }>();
  for (const item of items) {
    const normalized = toSkill(item);
    if (!normalized) continue;
    const key = normalized.name.toLowerCase();
    const sourceIds = new Set(normalized.sourceEntryIds ?? []);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { skill: normalized, sourceIds });
      continue;
    }
    for (const id of sourceIds) {
      existing.sourceIds.add(id);
    }
    const existingTime = existing.skill.lastModified ?? existing.skill.createdAt ?? 0;
    const nextTime = normalized.lastModified ?? normalized.createdAt ?? 0;
    if (nextTime >= existingTime) {
      existing.skill = { ...normalized, sourceEntryIds: Array.from(existing.sourceIds) };
    }
  }
  const next = Array.from(map.values()).map((value) => ({
    ...value.skill,
    sourceEntryIds: Array.from(value.sourceIds),
  }));
  setStorageValue(FALLBACK_KEYS.skills, JSON.stringify(next));
  return next;
};

export const replaceFallbackInsights = (items: Insight[]): Insight[] => {
  const map = new Map<string, Insight>();
  for (const item of items) {
    const normalized = toInsight(item);
    if (!normalized) continue;
    map.set(normalized.id, normalized);
  }
  const next = Array.from(map.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);
  setStorageValue(FALLBACK_KEYS.insights, JSON.stringify(next));
  return next;
};

export const clearFallbackData = () => {
  removeStorageValue(FALLBACK_KEYS.journal);
  removeStorageValue(FALLBACK_KEYS.skills);
  removeStorageValue(FALLBACK_KEYS.insights);
};

export const clearFallbackSkills = () => {
  removeStorageValue(FALLBACK_KEYS.skills);
};

export const clearFallbackInsights = () => {
  removeStorageValue(FALLBACK_KEYS.insights);
};
