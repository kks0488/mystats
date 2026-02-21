import { describe, expect, it } from 'vitest';
import type { Insight, JournalEntry, Skill } from '@/db/db';
import {
  buildJournalExplorerIndex,
  filterJournalEntries,
  JOURNAL_EXPLORER_DEFAULT_FILTERS,
  type JournalExplorerFilters,
} from './journalExplorer';

const entry = (partial: Partial<JournalEntry>): JournalEntry => ({
  id: partial.id || '550e8400-e29b-41d4-a716-446655440000',
  content: partial.content || 'hello',
  timestamp: partial.timestamp ?? Date.now(),
  type: partial.type || 'journal',
  lastModified: partial.lastModified,
});

const skill = (partial: Partial<Skill>): Skill => ({
  id: partial.id || '550e8400-e29b-41d4-a716-446655440100',
  name: partial.name || 'TypeScript',
  category: partial.category || 'hard',
  sourceEntryIds: partial.sourceEntryIds || [],
  createdAt: partial.createdAt ?? Date.now(),
  lastModified: partial.lastModified,
});

const insight = (partial: Partial<Insight>): Insight => ({
  id: partial.id || '550e8400-e29b-41d4-a716-446655440200',
  entryId: partial.entryId || '550e8400-e29b-41d4-a716-446655440000',
  title: partial.title,
  content: partial.content,
  archetypes: partial.archetypes || [],
  hiddenPatterns: partial.hiddenPatterns || [],
  criticalQuestions: partial.criticalQuestions || [],
  evidenceQuotes: partial.evidenceQuotes || [],
  timestamp: partial.timestamp ?? Date.now(),
  lastModified: partial.lastModified,
});

describe('journalExplorer', () => {
  it('matches query across skills and insights', () => {
    const e1 = entry({ id: '550e8400-e29b-41d4-a716-446655440001', content: 'entry one', timestamp: 1000 });
    const e2 = entry({ id: '550e8400-e29b-41d4-a716-446655440002', content: 'entry two', timestamp: 2000 });

    const skills = [skill({ name: 'TypeScript', sourceEntryIds: [e2.id] })];
    const insights = [insight({ entryId: e1.id, archetypes: ['Builder'], evidenceQuotes: ['I build systems.'] })];

    const index = buildJournalExplorerIndex([e1, e2], skills, insights);

    const bySkill = filterJournalEntries([e1, e2], index, { ...JOURNAL_EXPLORER_DEFAULT_FILTERS, query: 'typescript' }, 3000);
    expect(bySkill.map((e) => e.id)).toEqual([e2.id]);

    const byInsight = filterJournalEntries([e1, e2], index, { ...JOURNAL_EXPLORER_DEFAULT_FILTERS, query: 'builder' }, 3000);
    expect(byInsight.map((e) => e.id)).toEqual([e1.id]);
  });

  it('filters by date preset and type', () => {
    const now = 1_000_000_000;
    const recent = entry({ id: '550e8400-e29b-41d4-a716-446655440010', timestamp: now - 2 * 24 * 60 * 60 * 1000, type: 'journal' });
    const old = entry({ id: '550e8400-e29b-41d4-a716-446655440011', timestamp: now - 40 * 24 * 60 * 60 * 1000, type: 'project' });

    const index = buildJournalExplorerIndex([recent, old], [], []);
    const filters: JournalExplorerFilters = {
      ...JOURNAL_EXPLORER_DEFAULT_FILTERS,
      datePreset: '30d',
      entryType: 'journal',
    };

    const filtered = filterJournalEntries([recent, old], index, filters, now);
    expect(filtered.map((e) => e.id)).toEqual([recent.id]);
  });

  it('filters by hasInsight and skill categories', () => {
    const e1 = entry({ id: '550e8400-e29b-41d4-a716-446655440020', timestamp: 1000 });
    const e2 = entry({ id: '550e8400-e29b-41d4-a716-446655440021', timestamp: 2000 });
    const skills = [
      skill({ name: 'Leadership', category: 'soft', sourceEntryIds: [e1.id] }),
      skill({ name: 'React', category: 'hard', sourceEntryIds: [e2.id] }),
    ];
    const insights = [insight({ entryId: e2.id, archetypes: ['Explorer'] })];
    const index = buildJournalExplorerIndex([e1, e2], skills, insights);

    const onlyInsight = filterJournalEntries(
      [e1, e2],
      index,
      { ...JOURNAL_EXPLORER_DEFAULT_FILTERS, hasInsight: 'yes' },
      3000
    );
    expect(onlyInsight.map((e) => e.id)).toEqual([e2.id]);

    const onlySoft = filterJournalEntries(
      [e1, e2],
      index,
      { ...JOURNAL_EXPLORER_DEFAULT_FILTERS, categories: ['soft'] },
      3000
    );
    expect(onlySoft.map((e) => e.id)).toEqual([e1.id]);
  });
});

