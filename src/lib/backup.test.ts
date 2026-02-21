import { describe, it, expect } from 'vitest';
import { parseBackupPayload, hasAnyFallbackCollections, mergeById } from './backup';

describe('backup/parseBackupPayload', () => {
  it('supports legacy `entries` key for journal', () => {
    const parsed = parseBackupPayload({
      entries: [{ id: 'a' }],
      skills: [],
      solutions: [],
      insights: [],
    });
    expect(parsed.base.journal).toEqual([{ id: 'a' }]);
  });

  it('supports fallback legacy `entries` key', () => {
    const parsed = parseBackupPayload({
      journal: [],
      skills: [],
      solutions: [],
      insights: [],
      fallback: {
        entries: [{ id: 'b' }],
        skills: [{ id: 'c' }],
        solutions: [{ id: 'e' }],
        insights: [{ id: 'd' }],
      },
    });
    expect(parsed.fallback.journal).toEqual([{ id: 'b' }]);
    expect(parsed.fallback.skills).toEqual([{ id: 'c' }]);
    expect(parsed.fallback.solutions).toEqual([{ id: 'e' }]);
    expect(parsed.fallback.insights).toEqual([{ id: 'd' }]);
  });

  it('tolerates non-object inputs', () => {
    const parsed = parseBackupPayload(null);
    expect(parsed.base).toEqual({ journal: [], skills: [], solutions: [], insights: [] });
    expect(parsed.fallback).toEqual({ journal: [], skills: [], solutions: [], insights: [] });
  });

  it('treats non-array fields as empty', () => {
    const parsed = parseBackupPayload({ journal: {}, skills: 'x', solutions: 3, insights: null });
    expect(parsed.base).toEqual({ journal: [], skills: [], solutions: [], insights: [] });
  });
});

describe('backup/hasAnyFallbackCollections', () => {
  it('returns false when all empty', () => {
    expect(hasAnyFallbackCollections({ journal: [], skills: [], solutions: [], insights: [] })).toBe(false);
  });

  it('returns true when any has items', () => {
    expect(hasAnyFallbackCollections({ journal: [{ id: 1 }], skills: [], solutions: [], insights: [] })).toBe(true);
  });
});

describe('backup/mergeById', () => {
  it('keeps the last record per id', () => {
    const merged = mergeById([{ id: 'x', v: 1 }, { id: 'x', v: 2 }, { id: 'y', v: 3 }]);
    expect(merged).toEqual([{ id: 'x', v: 2 }, { id: 'y', v: 3 }]);
  });
});
