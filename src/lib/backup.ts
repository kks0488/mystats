import type { Insight, JournalEntry, Skill } from '@/db/db';

export type BackupCollections = {
  journal: unknown[];
  skills: unknown[];
  solutions: unknown[];
  insights: unknown[];
};

export type BackupFallbackCollections = {
  journal: unknown[];
  skills: unknown[];
  solutions: unknown[];
  insights: unknown[];
};

export type ParsedBackup = {
  base: BackupCollections;
  fallback: BackupFallbackCollections;
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseBackupPayload(raw: unknown): ParsedBackup {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const journal = Array.isArray(data.journal) ? data.journal : Array.isArray(data.entries) ? data.entries : [];
  const skills = asArray(data.skills);
  const solutions = asArray(data.solutions);
  const insights = asArray(data.insights);

  const fallbackObj =
    data.fallback && typeof data.fallback === 'object' ? (data.fallback as Record<string, unknown>) : null;
  const fallbackJournal = fallbackObj
    ? Array.isArray(fallbackObj.journal)
      ? fallbackObj.journal
      : Array.isArray(fallbackObj.entries)
        ? fallbackObj.entries
        : []
    : [];
  const fallbackSkills = fallbackObj ? asArray(fallbackObj.skills) : [];
  const fallbackSolutions = fallbackObj ? asArray(fallbackObj.solutions) : [];
  const fallbackInsights = fallbackObj ? asArray(fallbackObj.insights) : [];

  return {
    base: { journal, skills, solutions, insights },
    fallback: { journal: fallbackJournal, skills: fallbackSkills, solutions: fallbackSolutions, insights: fallbackInsights },
  };
}

export function hasAnyFallbackCollections(fallback: BackupFallbackCollections): boolean {
  return fallback.journal.length > 0 || fallback.skills.length > 0 || fallback.insights.length > 0 || fallback.solutions.length > 0;
}

export function mergeById<T extends { id?: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const id = item?.id;
    if (typeof id !== 'string' || !id.trim()) continue;
    map.set(id, item);
  }
  return Array.from(map.values());
}

export type ImportCollections = {
  journal: JournalEntry[];
  skills: Skill[];
  solutions: { id?: string }[];
  insights: Insight[];
};
