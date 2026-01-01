import type { JournalEntry, Skill, Insight } from './db';

const FALLBACK_KEYS = {
  journal: 'MYSTATS_FALLBACK_JOURNAL',
  skills: 'MYSTATS_FALLBACK_SKILLS',
  insights: 'MYSTATS_FALLBACK_INSIGHTS',
} as const;

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
    const raw = localStorage.getItem(key);
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
  const content = typeof record.content === 'string' ? record.content : '';
  if (!content) return null;
  const timestamp = typeof record.timestamp === 'number' ? record.timestamp : Date.now();
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
  localStorage.setItem(FALLBACK_KEYS.journal, JSON.stringify(next));
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
  localStorage.setItem(FALLBACK_KEYS.skills, JSON.stringify(existing));
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
  localStorage.setItem(FALLBACK_KEYS.insights, JSON.stringify(next));
  return next;
};

export const clearFallbackData = () => {
  localStorage.removeItem(FALLBACK_KEYS.journal);
  localStorage.removeItem(FALLBACK_KEYS.skills);
  localStorage.removeItem(FALLBACK_KEYS.insights);
};

export const clearFallbackSkills = () => {
  localStorage.removeItem(FALLBACK_KEYS.skills);
};

export const clearFallbackInsights = () => {
  localStorage.removeItem(FALLBACK_KEYS.insights);
};
