import type { Insight, JournalEntry, Skill } from '@/db/db';

export type JournalExplorerDatePreset = 'all' | '7d' | '30d' | 'custom';
export type JournalExplorerHasInsight = 'all' | 'yes' | 'no';
export type JournalExplorerEntryType = 'all' | 'journal' | 'project';

export type JournalExplorerFilters = {
  query: string;
  datePreset: JournalExplorerDatePreset;
  startDate: string; // YYYY-MM-DD (local), or ''
  endDate: string; // YYYY-MM-DD (local), or ''
  entryType: JournalExplorerEntryType;
  hasInsight: JournalExplorerHasInsight;
  categories: Skill['category'][];
};

export const JOURNAL_EXPLORER_DEFAULT_FILTERS: JournalExplorerFilters = {
  query: '',
  datePreset: 'all',
  startDate: '',
  endDate: '',
  entryType: 'all',
  hasInsight: 'all',
  categories: [],
};

export type JournalExplorerIndex = {
  skillsByEntryId: Map<string, Skill[]>;
  insightByEntryId: Map<string, Insight>;
  searchTextByEntryId: Map<string, string>;
};

function normalizeTokens(query: string): string[] {
  const normalized = (query || '').trim().toLowerCase();
  if (!normalized) return [];
  return normalized.split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

function buildSkillsByEntryId(skills: Skill[]): Map<string, Skill[]> {
  const map = new Map<string, Skill[]>();
  for (const skill of skills) {
    if (!skill || typeof skill !== 'object') continue;
    if (!Array.isArray(skill.sourceEntryIds)) continue;
    for (const entryId of skill.sourceEntryIds) {
      if (!entryId) continue;
      const existing = map.get(entryId);
      if (existing) {
        existing.push(skill);
      } else {
        map.set(entryId, [skill]);
      }
    }
  }
  return map;
}

function buildInsightByEntryId(insights: Insight[]): Map<string, Insight> {
  const map = new Map<string, Insight>();
  for (const insight of insights) {
    const entryId = insight?.entryId;
    if (!entryId) continue;
    const existing = map.get(entryId);
    if (!existing) {
      map.set(entryId, insight);
      continue;
    }
    const existingTime = existing.lastModified ?? existing.timestamp ?? 0;
    const nextTime = insight.lastModified ?? insight.timestamp ?? 0;
    if (nextTime >= existingTime) {
      map.set(entryId, insight);
    }
  }
  return map;
}

function buildSearchText(
  entry: JournalEntry,
  entrySkills: Skill[] | undefined,
  insight: Insight | undefined
): string {
  const skillNames = (entrySkills || []).map((s) => s.name).filter(Boolean);
  const insightPieces = insight
    ? [
        insight.title ?? '',
        insight.content ?? '',
        ...(insight.archetypes || []),
        ...(insight.hiddenPatterns || []),
        ...(insight.criticalQuestions || []),
        ...(insight.evidenceQuotes || []),
      ]
    : [];
  const raw = [entry.content, ...skillNames, ...insightPieces].join('\n');
  return raw.toLowerCase();
}

export function buildJournalExplorerIndex(entries: JournalEntry[], skills: Skill[], insights: Insight[]): JournalExplorerIndex {
  const skillsByEntryId = buildSkillsByEntryId(skills);
  const insightByEntryId = buildInsightByEntryId(insights);

  const searchTextByEntryId = new Map<string, string>();
  for (const entry of entries) {
    searchTextByEntryId.set(entry.id, buildSearchText(entry, skillsByEntryId.get(entry.id), insightByEntryId.get(entry.id)));
  }

  return { skillsByEntryId, insightByEntryId, searchTextByEntryId };
}

function parseDateStart(value: string): number | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  const ms = new Date(`${raw}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseDateEnd(value: string): number | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  const ms = new Date(`${raw}T23:59:59.999`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function matchesTokens(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const raw = (text || '').toLowerCase();
  return tokens.every((token) => raw.includes(token));
}

export function filterJournalEntries(
  entries: JournalEntry[],
  index: JournalExplorerIndex,
  filters: JournalExplorerFilters,
  nowMs: number = Date.now()
): JournalEntry[] {
  const tokens = normalizeTokens(filters.query);

  let minTs: number | null = null;
  let maxTs: number | null = null;

  if (filters.datePreset === '7d' || filters.datePreset === '30d') {
    const days = filters.datePreset === '7d' ? 7 : 30;
    minTs = nowMs - days * 24 * 60 * 60 * 1000;
  } else if (filters.datePreset === 'custom') {
    minTs = parseDateStart(filters.startDate);
    maxTs = parseDateEnd(filters.endDate);
  }

  const categorySet = new Set(filters.categories || []);

  return entries.filter((entry) => {
    if (filters.entryType !== 'all' && entry.type !== filters.entryType) return false;

    if (minTs !== null && entry.timestamp < minTs) return false;
    if (maxTs !== null && entry.timestamp > maxTs) return false;

    const hasInsight = index.insightByEntryId.has(entry.id);
    if (filters.hasInsight === 'yes' && !hasInsight) return false;
    if (filters.hasInsight === 'no' && hasInsight) return false;

    if (categorySet.size > 0) {
      const entrySkills = index.skillsByEntryId.get(entry.id) || [];
      const ok = entrySkills.some((skill) => categorySet.has(skill.category));
      if (!ok) return false;
    }

    const text = index.searchTextByEntryId.get(entry.id) || entry.content.toLowerCase();
    if (!matchesTokens(text, tokens)) return false;

    return true;
  });
}

export function isJournalExplorerFiltersActive(filters: JournalExplorerFilters): boolean {
  if ((filters.query || '').trim()) return true;
  if (filters.datePreset !== 'all') return true;
  if ((filters.startDate || '').trim()) return true;
  if ((filters.endDate || '').trim()) return true;
  if (filters.entryType !== 'all') return true;
  if (filters.hasInsight !== 'all') return true;
  if ((filters.categories || []).length > 0) return true;
  return false;
}
