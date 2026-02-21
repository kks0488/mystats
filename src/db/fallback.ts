import type { JournalEntry, Skill, Insight, Solution } from './db';
import { upsertTombstone } from '@/lib/tombstones';

const FALLBACK_KEYS = {
  journal: 'MYSTATS_FALLBACK_JOURNAL',
  skills: 'MYSTATS_FALLBACK_SKILLS',
  insights: 'MYSTATS_FALLBACK_INSIGHTS',
  solutions: 'MYSTATS_FALLBACK_SOLUTIONS',
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
    evidenceQuotes: Array.isArray(record.evidenceQuotes)
      ? (record.evidenceQuotes.filter((q) => typeof q === 'string') as string[])
      : [],
    timestamp: typeof record.timestamp === 'number' ? record.timestamp : Date.now(),
    lastModified: typeof record.lastModified === 'number' ? record.lastModified : undefined,
  };
};

const toSolution = (item: unknown): Solution | null => {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const problem = typeof record.problem === 'string' ? record.problem.trim() : '';
  const solution = typeof record.solution === 'string' ? record.solution.trim() : '';
  if (!problem || !solution) return null;
  const timestampRaw = record.timestamp;
  let timestamp =
    typeof timestampRaw === 'number'
      ? timestampRaw
      : typeof timestampRaw === 'string'
        ? new Date(timestampRaw).getTime()
        : Date.now();
  if (!Number.isFinite(timestamp)) timestamp = Date.now();

  const sourceEntryIds = Array.isArray(record.sourceEntryIds)
    ? (record.sourceEntryIds.filter((id) => typeof id === 'string') as string[])
    : undefined;
  const sourceSkillNames = Array.isArray(record.sourceSkillNames)
    ? (record.sourceSkillNames.filter((name) => typeof name === 'string') as string[])
    : undefined;
  const sourceArchetypes = Array.isArray(record.sourceArchetypes)
    ? (record.sourceArchetypes.filter((name) => typeof name === 'string') as string[])
    : undefined;

  const memuContext = (() => {
    if (!record.memuContext || typeof record.memuContext !== 'object') return undefined;
    const ctx = record.memuContext as Record<string, unknown>;
    const engine = ctx.engine === 'embedded' || ctx.engine === 'api' ? ctx.engine : null;
    const personalHits = typeof ctx.personalHits === 'number' ? ctx.personalHits : Number(ctx.personalHits);
    const projectHits = typeof ctx.projectHits === 'number' ? ctx.projectHits : Number(ctx.projectHits);
    if (!engine) return undefined;
    if (!Number.isFinite(personalHits) || personalHits < 0) return undefined;
    if (!Number.isFinite(projectHits) || projectHits < 0) return undefined;
    return {
      engine,
      personalHits,
      projectHits,
      failed: typeof ctx.failed === 'boolean' ? ctx.failed : undefined,
    } as Solution['memuContext'];
  })();

  return {
    id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
    problem,
    solution,
    sourceEntryIds,
    sourceSkillNames,
    sourceArchetypes,
    memuContext,
    timestamp,
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

export const loadFallbackSolutions = (): Solution[] => {
  return safeParseList(FALLBACK_KEYS.solutions)
    .map(toSolution)
    .filter((item): item is Solution => item !== null)
    .sort((a, b) => (b.lastModified ?? b.timestamp) - (a.lastModified ?? a.timestamp));
};

export const addFallbackInsight = (insight: Insight): Insight[] => {
  const existing = loadFallbackInsights().filter((item) => item.id !== insight.id);
  const next = [insight, ...existing].slice(0, 100);
  setStorageValue(FALLBACK_KEYS.insights, JSON.stringify(next));
  return next;
};

export const saveFallbackSolution = (item: Solution): Solution[] => {
  const existing = loadFallbackSolutions().filter((solution) => solution.id !== item.id);
  const next = [item, ...existing].slice(0, 100);
  setStorageValue(FALLBACK_KEYS.solutions, JSON.stringify(next));
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

export const replaceFallbackSolutions = (items: Solution[]): Solution[] => {
  const map = new Map<string, Solution>();
  for (const item of items) {
    const normalized = toSolution(item);
    if (!normalized) continue;
    map.set(normalized.id, normalized);
  }
  const next = Array.from(map.values())
    .sort((a, b) => (b.lastModified ?? b.timestamp) - (a.lastModified ?? a.timestamp))
    .slice(0, 100);
  setStorageValue(FALLBACK_KEYS.solutions, JSON.stringify(next));
  return next;
};

export const clearFallbackData = () => {
  removeStorageValue(FALLBACK_KEYS.journal);
  removeStorageValue(FALLBACK_KEYS.skills);
  removeStorageValue(FALLBACK_KEYS.insights);
  removeStorageValue(FALLBACK_KEYS.solutions);
};

export const clearFallbackSkills = () => {
  removeStorageValue(FALLBACK_KEYS.skills);
};

export const clearFallbackInsights = () => {
  removeStorageValue(FALLBACK_KEYS.insights);
};

export const clearFallbackSolutions = () => {
  removeStorageValue(FALLBACK_KEYS.solutions);
};

export const updateFallbackJournalEntry = (
  entryId: string,
  content: string,
  lastModified: number = Date.now()
): JournalEntry[] => {
  const entries = loadFallbackJournalEntries();
  const existing = entries.find((item) => item.id === entryId);
  if (!existing) return entries;
  const updated: JournalEntry = {
    ...existing,
    content,
    lastModified,
  };
  return replaceFallbackJournalEntries([updated, ...entries.filter((item) => item.id !== entryId)]);
};

export const upsertFallbackInsightByEntryId = (
  entryId: string,
  patch: Partial<
    Pick<Insight, 'title' | 'content' | 'archetypes' | 'hiddenPatterns' | 'criticalQuestions' | 'evidenceQuotes'>
  >,
  entryTimestamp: number,
  lastModified: number = Date.now()
): Insight[] => {
  const insights = loadFallbackInsights();
  const existing = insights
    .filter((item) => item.entryId === entryId)
    .sort((a, b) => (b.lastModified ?? b.timestamp ?? 0) - (a.lastModified ?? a.timestamp ?? 0))[0];

  const next: Insight = {
    id: existing?.id ?? crypto.randomUUID(),
    entryId,
    title: patch.title ?? existing?.title,
    content: patch.content ?? existing?.content,
    archetypes: patch.archetypes ?? existing?.archetypes ?? [],
    hiddenPatterns: patch.hiddenPatterns ?? existing?.hiddenPatterns ?? [],
    criticalQuestions: patch.criticalQuestions ?? existing?.criticalQuestions ?? [],
    evidenceQuotes: patch.evidenceQuotes ?? existing?.evidenceQuotes ?? [],
    timestamp: entryTimestamp,
    lastModified,
  };

  return replaceFallbackInsights([next, ...insights.filter((item) => item.entryId !== entryId)]);
};

export const deleteFallbackJournalEntryCascade = (
  entryId: string,
  tombstoneTs: number = Date.now()
): {
  journal: JournalEntry[];
  skills: Skill[];
  insights: Insight[];
} => {
  const ts = Number.isFinite(Number(tombstoneTs)) && Number(tombstoneTs) > 0 ? Number(tombstoneTs) : Date.now();

  // Always record a tombstone for the journal entry so it won't resurrect via sync.
  upsertTombstone('journal', entryId, ts);

  const currentJournal = loadFallbackJournalEntries();
  const nextJournal = replaceFallbackJournalEntries(currentJournal.filter((item) => item.id !== entryId));

  const currentInsights = loadFallbackInsights();
  const deletedInsights = currentInsights.filter((item) => item.entryId === entryId);
  for (const insight of deletedInsights) {
    upsertTombstone('insights', insight.id, ts);
  }
  const nextInsights = replaceFallbackInsights(currentInsights.filter((item) => item.entryId !== entryId));

  const currentSkills = loadFallbackSkills();
  const nextSkills: Skill[] = [];
  for (const skill of currentSkills) {
    if (!Array.isArray(skill.sourceEntryIds) || !skill.sourceEntryIds.includes(entryId)) {
      nextSkills.push(skill);
      continue;
    }
    const remaining = skill.sourceEntryIds.filter((id) => id !== entryId);
    if (remaining.length === 0) {
      upsertTombstone('skills', skill.id, ts);
      continue;
    }
    nextSkills.push({
      ...skill,
      sourceEntryIds: remaining,
      lastModified: ts,
    });
  }
  const storedSkills = replaceFallbackSkills(nextSkills);

  return { journal: nextJournal, skills: storedSkills, insights: nextInsights };
};

export const deleteFallbackSolution = (solutionId: string): Solution[] => {
  const cleanId = (solutionId || '').trim();
  if (!cleanId) return loadFallbackSolutions();
  return replaceFallbackSolutions(loadFallbackSolutions().filter((item) => item.id !== cleanId));
};
