import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { JournalEntry, Skill, Insight } from './db';
import {
  getFallbackStorageMode,
  loadFallbackJournalEntries,
  saveFallbackJournalEntry,
  loadFallbackSkills,
  upsertFallbackSkill,
  loadFallbackInsights,
  addFallbackInsight,
  clearFallbackData,
  clearFallbackSkills,
  clearFallbackInsights,
  replaceFallbackJournalEntries,
  replaceFallbackSkills,
  replaceFallbackInsights,
} from './fallback';

const FALLBACK_KEYS = {
  journal: 'MYSTATS_FALLBACK_JOURNAL',
  skills: 'MYSTATS_FALLBACK_SKILLS',
  insights: 'MYSTATS_FALLBACK_INSIGHTS',
} as const;

describe('fallback storage', () => {
  beforeEach(() => {
    // localStorage 초기화
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('getFallbackStorageMode', () => {
    it('기본값으로 local 모드를 반환한다', () => {
      expect(getFallbackStorageMode()).toBe('local');
    });
  });

  describe('loadFallbackJournalEntries', () => {
    it('빈 배열을 반환한다 (저장소가 비어있을 때)', () => {
      const result = loadFallbackJournalEntries();
      expect(result).toEqual([]);
    });

    it('저장된 엔트리를 timestamp 내림차순으로 반환한다', () => {
      const now = Date.now();
      const entries: JournalEntry[] = [
        { id: 'a', content: 'first', timestamp: now - 3000, type: 'journal' },
        { id: 'b', content: 'second', timestamp: now - 1000, type: 'journal' },
        { id: 'c', content: 'third', timestamp: now - 2000, type: 'journal' },
      ];

      localStorage.setItem(FALLBACK_KEYS.journal, JSON.stringify(entries));

      const result = loadFallbackJournalEntries();
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('b'); // 가장 최근
      expect(result[1].id).toBe('c');
      expect(result[2].id).toBe('a'); // 가장 오래됨
    });

    it('잘못된 JSON이 있어도 빈 배열을 반환한다', () => {
      localStorage.setItem(FALLBACK_KEYS.journal, 'invalid json');
      const result = loadFallbackJournalEntries();
      expect(result).toEqual([]);
    });

    it('content가 없는 엔트리는 필터링한다', () => {
      const entries = [
        { id: 'a', content: 'valid', timestamp: Date.now(), type: 'journal' },
        { id: 'b', timestamp: Date.now(), type: 'journal' }, // content 없음
        { id: 'c', content: '', timestamp: Date.now(), type: 'journal' }, // 빈 content
      ];

      localStorage.setItem(FALLBACK_KEYS.journal, JSON.stringify(entries));

      const result = loadFallbackJournalEntries();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });

    it('text 필드를 content로 정규화한다', () => {
      const entries = [{ id: 'a', text: 'from text field', timestamp: Date.now(), type: 'journal' }];
      localStorage.setItem(FALLBACK_KEYS.journal, JSON.stringify(entries));

      const result = loadFallbackJournalEntries();
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('from text field');
    });

    it('entry 필드를 content로 정규화한다', () => {
      const entries = [{ id: 'a', entry: 'from entry field', timestamp: Date.now(), type: 'journal' }];
      localStorage.setItem(FALLBACK_KEYS.journal, JSON.stringify(entries));

      const result = loadFallbackJournalEntries();
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('from entry field');
    });

    it('timestamp가 문자열이면 숫자로 변환한다', () => {
      const timestamp = '2025-01-29T10:00:00Z';
      const entries = [{ id: 'a', content: 'test', timestamp, type: 'journal' }];
      localStorage.setItem(FALLBACK_KEYS.journal, JSON.stringify(entries));

      const result = loadFallbackJournalEntries();
      expect(result).toHaveLength(1);
      expect(typeof result[0].timestamp).toBe('number');
      expect(result[0].timestamp).toBe(new Date(timestamp).getTime());
    });

    it('createdAt을 timestamp로 대체한다', () => {
      const createdAt = Date.now();
      const entries = [{ id: 'a', content: 'test', createdAt, type: 'journal' }];
      localStorage.setItem(FALLBACK_KEYS.journal, JSON.stringify(entries));

      const result = loadFallbackJournalEntries();
      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(createdAt);
    });

    it('type이 project이면 유지한다', () => {
      const entries = [{ id: 'a', content: 'test', timestamp: Date.now(), type: 'project' }];
      localStorage.setItem(FALLBACK_KEYS.journal, JSON.stringify(entries));

      const result = loadFallbackJournalEntries();
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('project');
    });

    it('type이 없으면 journal로 기본 설정한다', () => {
      const entries = [{ id: 'a', content: 'test', timestamp: Date.now() }];
      localStorage.setItem(FALLBACK_KEYS.journal, JSON.stringify(entries));

      const result = loadFallbackJournalEntries();
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('journal');
    });
  });

  describe('saveFallbackJournalEntry', () => {
    it('새 엔트리를 저장하고 반환한다', () => {
      const entry: JournalEntry = {
        id: crypto.randomUUID(),
        content: 'test entry',
        timestamp: Date.now(),
        type: 'journal',
      };

      const result = saveFallbackJournalEntry(entry);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(entry);

      const stored = loadFallbackJournalEntries();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toEqual(entry);
    });

    it('같은 id의 엔트리를 업데이트한다', () => {
      const id = crypto.randomUUID();
      const entry1: JournalEntry = {
        id,
        content: 'first version',
        timestamp: Date.now(),
        type: 'journal',
      };

      saveFallbackJournalEntry(entry1);

      const entry2: JournalEntry = {
        id,
        content: 'updated version',
        timestamp: Date.now(),
        type: 'journal',
      };

      const result = saveFallbackJournalEntry(entry2);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('updated version');
    });

    it('최대 200개 엔트리만 유지한다', () => {
      const entries: JournalEntry[] = [];
      for (let i = 0; i < 250; i++) {
        entries.push({
          id: crypto.randomUUID(),
          content: `entry ${i}`,
          timestamp: Date.now() + i,
          type: 'journal',
        });
      }

      let result: JournalEntry[] = [];
      for (const entry of entries) {
        result = saveFallbackJournalEntry(entry);
      }

      expect(result).toHaveLength(200);
      const stored = loadFallbackJournalEntries();
      expect(stored).toHaveLength(200);
    });

    it('최신 엔트리를 맨 앞에 추가한다', () => {
      const now = Date.now();
      const entry1: JournalEntry = {
        id: 'a',
        content: 'first',
        timestamp: now - 1000,
        type: 'journal',
      };
      const entry2: JournalEntry = {
        id: 'b',
        content: 'second',
        timestamp: now,
        type: 'journal',
      };

      saveFallbackJournalEntry(entry1);
      const result = saveFallbackJournalEntry(entry2);

      expect(result[0].id).toBe('b');
      expect(result[1].id).toBe('a');
    });
  });

  describe('loadFallbackSkills', () => {
    it('빈 배열을 반환한다 (저장소가 비어있을 때)', () => {
      const result = loadFallbackSkills();
      expect(result).toEqual([]);
    });

    it('저장된 스킬을 반환한다', () => {
      const skills: Skill[] = [
        {
          id: 'a',
          name: 'TypeScript',
          category: 'hard',
          sourceEntryIds: [],
          createdAt: Date.now(),
        },
        {
          id: 'b',
          name: 'Communication',
          category: 'soft',
          sourceEntryIds: [],
          createdAt: Date.now(),
        },
      ];

      localStorage.setItem(FALLBACK_KEYS.skills, JSON.stringify(skills));

      const result = loadFallbackSkills();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('TypeScript');
      expect(result[1].name).toBe('Communication');
    });

    it('잘못된 JSON이 있어도 빈 배열을 반환한다', () => {
      localStorage.setItem(FALLBACK_KEYS.skills, 'invalid json');
      const result = loadFallbackSkills();
      expect(result).toEqual([]);
    });

    it('name이 없는 스킬은 필터링한다', () => {
      const skills = [
        { id: 'a', name: 'Valid', category: 'hard', sourceEntryIds: [], createdAt: Date.now() },
        { id: 'b', category: 'soft', sourceEntryIds: [], createdAt: Date.now() }, // name 없음
        { id: 'c', name: '', category: 'trait', sourceEntryIds: [], createdAt: Date.now() }, // 빈 name
      ];

      localStorage.setItem(FALLBACK_KEYS.skills, JSON.stringify(skills));

      const result = loadFallbackSkills();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });

    it('name을 trim한다', () => {
      const skills = [
        { id: 'a', name: '  TypeScript  ', category: 'hard', sourceEntryIds: [], createdAt: Date.now() },
      ];

      localStorage.setItem(FALLBACK_KEYS.skills, JSON.stringify(skills));

      const result = loadFallbackSkills();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('TypeScript');
    });

    it('잘못된 category는 trait으로 기본 설정한다', () => {
      const skills = [
        { id: 'a', name: 'Test', category: 'invalid-category', sourceEntryIds: [], createdAt: Date.now() },
      ];

      localStorage.setItem(FALLBACK_KEYS.skills, JSON.stringify(skills));

      const result = loadFallbackSkills();
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('trait');
    });

    it('sourceEntryIds가 없으면 빈 배열로 기본 설정한다', () => {
      const skills = [{ id: 'a', name: 'Test', category: 'hard', createdAt: Date.now() }];

      localStorage.setItem(FALLBACK_KEYS.skills, JSON.stringify(skills));

      const result = loadFallbackSkills();
      expect(result).toHaveLength(1);
      expect(result[0].sourceEntryIds).toEqual([]);
    });

    it('sourceEntryIds에서 문자열이 아닌 항목을 필터링한다', () => {
      const skills = [
        {
          id: 'a',
          name: 'Test',
          category: 'hard',
          sourceEntryIds: ['valid-id', 123, null, 'another-valid-id'],
          createdAt: Date.now(),
        },
      ];

      localStorage.setItem(FALLBACK_KEYS.skills, JSON.stringify(skills));

      const result = loadFallbackSkills();
      expect(result).toHaveLength(1);
      expect(result[0].sourceEntryIds).toEqual(['valid-id', 'another-valid-id']);
    });
  });

  describe('upsertFallbackSkill', () => {
    it('새 스킬을 추가한다', () => {
      const skillData = { name: 'TypeScript', category: 'hard' as const };
      const entryId = crypto.randomUUID();

      const result = upsertFallbackSkill(skillData, entryId);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('TypeScript');
      expect(result[0].category).toBe('hard');
      expect(result[0].sourceEntryIds).toEqual([entryId]);
    });

    it('entryId 없이 스킬을 추가할 수 있다', () => {
      const skillData = { name: 'TypeScript', category: 'hard' as const };

      const result = upsertFallbackSkill(skillData);
      expect(result).toHaveLength(1);
      expect(result[0].sourceEntryIds).toEqual([]);
    });

    it('소문자로 name을 비교하여 기존 스킬을 찾는다', () => {
      const skillData1 = { name: 'TypeScript', category: 'hard' as const };
      const entryId1 = crypto.randomUUID();
      upsertFallbackSkill(skillData1, entryId1);

      const skillData2 = { name: 'typescript', category: 'hard' as const };
      const entryId2 = crypto.randomUUID();
      const result = upsertFallbackSkill(skillData2, entryId2);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('TypeScript'); // 원래 이름 유지
      expect(result[0].sourceEntryIds).toEqual([entryId1, entryId2]);
    });

    it('같은 entryId는 중복 추가하지 않는다', () => {
      const skillData = { name: 'TypeScript', category: 'hard' as const };
      const entryId = crypto.randomUUID();

      upsertFallbackSkill(skillData, entryId);
      const result = upsertFallbackSkill(skillData, entryId);

      expect(result).toHaveLength(1);
      expect(result[0].sourceEntryIds).toEqual([entryId]);
    });

    it('업데이트 시 lastModified를 갱신한다', () => {
      const skillData = { name: 'TypeScript', category: 'hard' as const };
      const entryId1 = crypto.randomUUID();
      const entryId2 = crypto.randomUUID();

      upsertFallbackSkill(skillData, entryId1);
      const before = loadFallbackSkills()[0].lastModified;

      // 시간이 지났다고 가정
      const result = upsertFallbackSkill(skillData, entryId2);

      expect(result[0].lastModified).toBeDefined();
      if (before !== undefined) {
        expect(result[0].lastModified!).toBeGreaterThanOrEqual(before);
      }
    });

    it('새 스킬에도 lastModified를 설정한다', () => {
      const skillData = { name: 'TypeScript', category: 'hard' as const };
      const result = upsertFallbackSkill(skillData);

      expect(result[0].lastModified).toBeDefined();
      expect(typeof result[0].lastModified).toBe('number');
    });
  });

  describe('loadFallbackInsights', () => {
    it('빈 배열을 반환한다 (저장소가 비어있을 때)', () => {
      const result = loadFallbackInsights();
      expect(result).toEqual([]);
    });

    it('저장된 인사이트를 timestamp 내림차순으로 반환한다', () => {
      const now = Date.now();
      const insights: Insight[] = [
        {
          id: 'a',
          entryId: 'entry-1',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: now - 3000,
        },
        {
          id: 'b',
          entryId: 'entry-2',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: now - 1000,
        },
        {
          id: 'c',
          entryId: 'entry-3',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: now - 2000,
        },
      ];

      localStorage.setItem(FALLBACK_KEYS.insights, JSON.stringify(insights));

      const result = loadFallbackInsights();
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('b'); // 가장 최근
      expect(result[1].id).toBe('c');
      expect(result[2].id).toBe('a'); // 가장 오래됨
    });

    it('잘못된 JSON이 있어도 빈 배열을 반환한다', () => {
      localStorage.setItem(FALLBACK_KEYS.insights, 'invalid json');
      const result = loadFallbackInsights();
      expect(result).toEqual([]);
    });

    it('배열 필드의 문자열이 아닌 항목을 필터링한다', () => {
      const insights = [
        {
          id: 'a',
          entryId: 'entry-1',
          archetypes: ['valid', 123, null, 'another'],
          hiddenPatterns: ['pattern', false],
          criticalQuestions: ['question', undefined, 'another'],
          timestamp: Date.now(),
        },
      ];

      localStorage.setItem(FALLBACK_KEYS.insights, JSON.stringify(insights));

      const result = loadFallbackInsights();
      expect(result).toHaveLength(1);
      expect(result[0].archetypes).toEqual(['valid', 'another']);
      expect(result[0].hiddenPatterns).toEqual(['pattern']);
      expect(result[0].criticalQuestions).toEqual(['question', 'another']);
    });

    it('배열 필드가 없으면 빈 배열로 기본 설정한다', () => {
      const insights = [{ id: 'a', entryId: 'entry-1', timestamp: Date.now() }];

      localStorage.setItem(FALLBACK_KEYS.insights, JSON.stringify(insights));

      const result = loadFallbackInsights();
      expect(result).toHaveLength(1);
      expect(result[0].archetypes).toEqual([]);
      expect(result[0].hiddenPatterns).toEqual([]);
      expect(result[0].criticalQuestions).toEqual([]);
    });

    it('title과 content 필드를 유지한다', () => {
      const insights = [
        {
          id: 'a',
          entryId: 'entry-1',
          title: 'Test Title',
          content: 'Test Content',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: Date.now(),
        },
      ];

      localStorage.setItem(FALLBACK_KEYS.insights, JSON.stringify(insights));

      const result = loadFallbackInsights();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Title');
      expect(result[0].content).toBe('Test Content');
    });
  });

  describe('addFallbackInsight', () => {
    it('새 인사이트를 저장하고 반환한다', () => {
      const insight: Insight = {
        id: crypto.randomUUID(),
        entryId: crypto.randomUUID(),
        archetypes: ['archetype1'],
        hiddenPatterns: ['pattern1'],
        criticalQuestions: ['question1'],
        timestamp: Date.now(),
      };

      const result = addFallbackInsight(insight);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(insight);

      const stored = loadFallbackInsights();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toEqual(insight);
    });

    it('같은 id의 인사이트를 업데이트한다', () => {
      const id = crypto.randomUUID();
      const entryId = crypto.randomUUID();
      const insight1: Insight = {
        id,
        entryId,
        archetypes: ['first'],
        hiddenPatterns: [],
        criticalQuestions: [],
        timestamp: Date.now(),
      };

      addFallbackInsight(insight1);

      const insight2: Insight = {
        id,
        entryId,
        archetypes: ['updated'],
        hiddenPatterns: [],
        criticalQuestions: [],
        timestamp: Date.now(),
      };

      const result = addFallbackInsight(insight2);
      expect(result).toHaveLength(1);
      expect(result[0].archetypes).toEqual(['updated']);
    });

    it('최대 100개 인사이트만 유지한다', () => {
      const insights: Insight[] = [];
      for (let i = 0; i < 150; i++) {
        insights.push({
          id: crypto.randomUUID(),
          entryId: crypto.randomUUID(),
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: Date.now() + i,
        });
      }

      let result: Insight[] = [];
      for (const insight of insights) {
        result = addFallbackInsight(insight);
      }

      expect(result).toHaveLength(100);
      const stored = loadFallbackInsights();
      expect(stored).toHaveLength(100);
    });

    it('최신 인사이트를 맨 앞에 추가한다', () => {
      const now = Date.now();
      const insight1: Insight = {
        id: 'a',
        entryId: 'entry-1',
        archetypes: [],
        hiddenPatterns: [],
        criticalQuestions: [],
        timestamp: now - 1000,
      };
      const insight2: Insight = {
        id: 'b',
        entryId: 'entry-2',
        archetypes: [],
        hiddenPatterns: [],
        criticalQuestions: [],
        timestamp: now,
      };

      addFallbackInsight(insight1);
      const result = addFallbackInsight(insight2);

      expect(result[0].id).toBe('b');
      expect(result[1].id).toBe('a');
    });
  });

  describe('replaceFallbackJournalEntries', () => {
    it('모든 엔트리를 교체한다', () => {
      const oldEntry: JournalEntry = {
        id: 'old',
        content: 'old entry',
        timestamp: Date.now(),
        type: 'journal',
      };
      saveFallbackJournalEntry(oldEntry);

      const newEntries: JournalEntry[] = [
        { id: 'a', content: 'new entry 1', timestamp: Date.now(), type: 'journal' },
        { id: 'b', content: 'new entry 2', timestamp: Date.now(), type: 'journal' },
      ];

      const result = replaceFallbackJournalEntries(newEntries);
      expect(result).toHaveLength(2);
      expect(result.find((e) => e.id === 'old')).toBeUndefined();
      expect(result.find((e) => e.id === 'a')).toBeDefined();
      expect(result.find((e) => e.id === 'b')).toBeDefined();
    });

    it('중복된 id를 제거한다', () => {
      const entries: JournalEntry[] = [
        { id: 'same', content: 'first', timestamp: Date.now(), type: 'journal' },
        { id: 'same', content: 'second', timestamp: Date.now(), type: 'journal' },
        { id: 'different', content: 'unique', timestamp: Date.now(), type: 'journal' },
      ];

      const result = replaceFallbackJournalEntries(entries);
      expect(result).toHaveLength(2);
      expect(result.filter((e) => e.id === 'same')).toHaveLength(1);
    });

    it('timestamp 내림차순으로 정렬한다', () => {
      const now = Date.now();
      const entries: JournalEntry[] = [
        { id: 'a', content: 'old', timestamp: now - 3000, type: 'journal' },
        { id: 'b', content: 'new', timestamp: now - 1000, type: 'journal' },
        { id: 'c', content: 'middle', timestamp: now - 2000, type: 'journal' },
      ];

      const result = replaceFallbackJournalEntries(entries);
      expect(result[0].id).toBe('b');
      expect(result[1].id).toBe('c');
      expect(result[2].id).toBe('a');
    });

    it('최대 200개 엔트리만 유지한다', () => {
      const entries: JournalEntry[] = [];
      for (let i = 0; i < 250; i++) {
        entries.push({
          id: crypto.randomUUID(),
          content: `entry ${i}`,
          timestamp: Date.now() + i,
          type: 'journal',
        });
      }

      const result = replaceFallbackJournalEntries(entries);
      expect(result).toHaveLength(200);
    });

    it('잘못된 엔트리는 필터링한다', () => {
      const entries = [
        { id: 'a', content: 'valid', timestamp: Date.now(), type: 'journal' },
        { id: 'b', timestamp: Date.now(), type: 'journal' }, // content 없음
        { id: 'c', content: '', timestamp: Date.now(), type: 'journal' }, // 빈 content
      ] as JournalEntry[];

      const result = replaceFallbackJournalEntries(entries);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });
  });

  describe('replaceFallbackSkills', () => {
    it('모든 스킬을 교체한다', () => {
      const oldSkill: Skill = {
        id: 'old',
        name: 'Old Skill',
        category: 'hard',
        sourceEntryIds: [],
        createdAt: Date.now(),
      };
      localStorage.setItem(FALLBACK_KEYS.skills, JSON.stringify([oldSkill]));

      const newSkills: Skill[] = [
        { id: 'a', name: 'New Skill 1', category: 'soft', sourceEntryIds: [], createdAt: Date.now() },
        { id: 'b', name: 'New Skill 2', category: 'hard', sourceEntryIds: [], createdAt: Date.now() },
      ];

      const result = replaceFallbackSkills(newSkills);
      expect(result).toHaveLength(2);
      expect(result.find((s) => s.id === 'old')).toBeUndefined();
      expect(result.find((s) => s.name === 'New Skill 1')).toBeDefined();
      expect(result.find((s) => s.name === 'New Skill 2')).toBeDefined();
    });

    it('소문자 name으로 중복을 병합한다', () => {
      const skills: Skill[] = [
        { id: 'a', name: 'TypeScript', category: 'hard', sourceEntryIds: ['entry-1'], createdAt: Date.now() },
        { id: 'b', name: 'typescript', category: 'hard', sourceEntryIds: ['entry-2'], createdAt: Date.now() },
        { id: 'c', name: 'TYPESCRIPT', category: 'hard', sourceEntryIds: ['entry-3'], createdAt: Date.now() },
      ];

      const result = replaceFallbackSkills(skills);
      expect(result).toHaveLength(1);
      expect(result[0].sourceEntryIds).toEqual(expect.arrayContaining(['entry-1', 'entry-2', 'entry-3']));
      expect(result[0].sourceEntryIds).toHaveLength(3);
    });

    it('병합 시 sourceEntryIds를 유니온한다', () => {
      const skills: Skill[] = [
        { id: 'a', name: 'React', category: 'hard', sourceEntryIds: ['entry-1', 'entry-2'], createdAt: Date.now() },
        { id: 'b', name: 'react', category: 'hard', sourceEntryIds: ['entry-2', 'entry-3'], createdAt: Date.now() },
      ];

      const result = replaceFallbackSkills(skills);
      expect(result).toHaveLength(1);
      expect(result[0].sourceEntryIds).toEqual(expect.arrayContaining(['entry-1', 'entry-2', 'entry-3']));
      expect(result[0].sourceEntryIds).toHaveLength(3);
    });

    it('병합 시 더 최근의 스킬 메타데이터를 사용한다', () => {
      const now = Date.now();
      const skills: Skill[] = [
        {
          id: 'a',
          name: 'React',
          category: 'hard',
          sourceEntryIds: [],
          createdAt: now - 1000,
          lastModified: now - 500,
        },
        { id: 'b', name: 'react', category: 'soft', sourceEntryIds: [], createdAt: now, lastModified: now },
      ];

      const result = replaceFallbackSkills(skills);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('soft'); // 더 최근 것
      expect(result[0].lastModified).toBe(now);
    });

    it('잘못된 스킬은 필터링한다', () => {
      const skills = [
        { id: 'a', name: 'Valid', category: 'hard', sourceEntryIds: [], createdAt: Date.now() },
        { id: 'b', category: 'soft', sourceEntryIds: [], createdAt: Date.now() }, // name 없음
        { id: 'c', name: '', category: 'trait', sourceEntryIds: [], createdAt: Date.now() }, // 빈 name
      ] as Skill[];

      const result = replaceFallbackSkills(skills);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Valid');
    });
  });

  describe('replaceFallbackInsights', () => {
    it('모든 인사이트를 교체한다', () => {
      const oldInsight: Insight = {
        id: 'old',
        entryId: 'old-entry',
        archetypes: [],
        hiddenPatterns: [],
        criticalQuestions: [],
        timestamp: Date.now(),
      };
      addFallbackInsight(oldInsight);

      const newInsights: Insight[] = [
        {
          id: 'a',
          entryId: 'entry-1',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: Date.now(),
        },
        {
          id: 'b',
          entryId: 'entry-2',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: Date.now(),
        },
      ];

      const result = replaceFallbackInsights(newInsights);
      expect(result).toHaveLength(2);
      expect(result.find((i) => i.id === 'old')).toBeUndefined();
      expect(result.find((i) => i.id === 'a')).toBeDefined();
      expect(result.find((i) => i.id === 'b')).toBeDefined();
    });

    it('중복된 id를 제거한다', () => {
      const insights: Insight[] = [
        {
          id: 'same',
          entryId: 'entry-1',
          archetypes: ['first'],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: Date.now(),
        },
        {
          id: 'same',
          entryId: 'entry-2',
          archetypes: ['second'],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: Date.now(),
        },
        {
          id: 'different',
          entryId: 'entry-3',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: Date.now(),
        },
      ];

      const result = replaceFallbackInsights(insights);
      expect(result).toHaveLength(2);
      expect(result.filter((i) => i.id === 'same')).toHaveLength(1);
    });

    it('timestamp 내림차순으로 정렬한다', () => {
      const now = Date.now();
      const insights: Insight[] = [
        {
          id: 'a',
          entryId: 'entry-1',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: now - 3000,
        },
        {
          id: 'b',
          entryId: 'entry-2',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: now - 1000,
        },
        {
          id: 'c',
          entryId: 'entry-3',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: now - 2000,
        },
      ];

      const result = replaceFallbackInsights(insights);
      expect(result[0].id).toBe('b');
      expect(result[1].id).toBe('c');
      expect(result[2].id).toBe('a');
    });

    it('최대 100개 인사이트만 유지한다', () => {
      const insights: Insight[] = [];
      for (let i = 0; i < 150; i++) {
        insights.push({
          id: crypto.randomUUID(),
          entryId: crypto.randomUUID(),
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: Date.now() + i,
        });
      }

      const result = replaceFallbackInsights(insights);
      expect(result).toHaveLength(100);
    });

    it('잘못된 인사이트는 null로 변환하여 필터링한다', () => {
      const insights = [
        {
          id: 'a',
          entryId: 'entry-1',
          archetypes: [],
          hiddenPatterns: [],
          criticalQuestions: [],
          timestamp: Date.now(),
        },
        null, // 잘못된 항목
        { id: 'b', archetypes: [], hiddenPatterns: [], criticalQuestions: [] }, // entryId 없음 (생성됨)
      ] as unknown as Insight[];

      const result = replaceFallbackInsights(insights);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.find((i) => i.id === 'a')).toBeDefined();
    });
  });

  describe('clearFallbackData', () => {
    it('모든 fallback 데이터를 삭제한다', () => {
      // 데이터 추가
      saveFallbackJournalEntry({
        id: crypto.randomUUID(),
        content: 'test',
        timestamp: Date.now(),
        type: 'journal',
      });
      upsertFallbackSkill({ name: 'Test', category: 'hard' });
      addFallbackInsight({
        id: crypto.randomUUID(),
        entryId: crypto.randomUUID(),
        archetypes: [],
        hiddenPatterns: [],
        criticalQuestions: [],
        timestamp: Date.now(),
      });

      expect(loadFallbackJournalEntries()).toHaveLength(1);
      expect(loadFallbackSkills()).toHaveLength(1);
      expect(loadFallbackInsights()).toHaveLength(1);

      clearFallbackData();

      expect(loadFallbackJournalEntries()).toHaveLength(0);
      expect(loadFallbackSkills()).toHaveLength(0);
      expect(loadFallbackInsights()).toHaveLength(0);
    });
  });

  describe('clearFallbackSkills', () => {
    it('스킬만 삭제한다', () => {
      saveFallbackJournalEntry({
        id: crypto.randomUUID(),
        content: 'test',
        timestamp: Date.now(),
        type: 'journal',
      });
      upsertFallbackSkill({ name: 'Test', category: 'hard' });
      addFallbackInsight({
        id: crypto.randomUUID(),
        entryId: crypto.randomUUID(),
        archetypes: [],
        hiddenPatterns: [],
        criticalQuestions: [],
        timestamp: Date.now(),
      });

      expect(loadFallbackSkills()).toHaveLength(1);

      clearFallbackSkills();

      expect(loadFallbackJournalEntries()).toHaveLength(1);
      expect(loadFallbackSkills()).toHaveLength(0);
      expect(loadFallbackInsights()).toHaveLength(1);
    });
  });

  describe('clearFallbackInsights', () => {
    it('인사이트만 삭제한다', () => {
      saveFallbackJournalEntry({
        id: crypto.randomUUID(),
        content: 'test',
        timestamp: Date.now(),
        type: 'journal',
      });
      upsertFallbackSkill({ name: 'Test', category: 'hard' });
      addFallbackInsight({
        id: crypto.randomUUID(),
        entryId: crypto.randomUUID(),
        archetypes: [],
        hiddenPatterns: [],
        criticalQuestions: [],
        timestamp: Date.now(),
      });

      expect(loadFallbackInsights()).toHaveLength(1);

      clearFallbackInsights();

      expect(loadFallbackJournalEntries()).toHaveLength(1);
      expect(loadFallbackSkills()).toHaveLength(1);
      expect(loadFallbackInsights()).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('빈 배열에서도 모든 작업이 동작한다', () => {
      expect(loadFallbackJournalEntries()).toEqual([]);
      expect(loadFallbackSkills()).toEqual([]);
      expect(loadFallbackInsights()).toEqual([]);

      clearFallbackData();
      expect(loadFallbackJournalEntries()).toEqual([]);
      expect(loadFallbackSkills()).toEqual([]);
      expect(loadFallbackInsights()).toEqual([]);
    });

    it('잘못된 데이터를 복원력 있게 처리한다', () => {
      localStorage.setItem(FALLBACK_KEYS.journal, 'not valid json');
      localStorage.setItem(FALLBACK_KEYS.skills, '{"not": "an array"}');
      localStorage.setItem(FALLBACK_KEYS.insights, 'null');

      expect(loadFallbackJournalEntries()).toEqual([]);
      expect(loadFallbackSkills()).toEqual([]);
      expect(loadFallbackInsights()).toEqual([]);
    });
  });
});
