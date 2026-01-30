import { describe, expect, it } from 'vitest';
import { normalizeSkillName, generateId, formatDate } from './utils';

describe('normalizeSkillName', () => {
  it('trims whitespace and collapses spaces', () => {
    expect(normalizeSkillName('  hello   world  ')).toBe('hello world');
  });

  it('strips leading/trailing quotes', () => {
    expect(normalizeSkillName('"React"')).toBe('react');
    expect(normalizeSkillName("'TypeScript'")).toBe('typescript');
    expect(normalizeSkillName('`Go`')).toBe('go');
  });

  it('strips trailing punctuation', () => {
    expect(normalizeSkillName('Communication.')).toBe('communication');
    expect(normalizeSkillName('Leadership!')).toBe('leadership');
    expect(normalizeSkillName('Problem Solving;')).toBe('problem solving');
  });

  it('lowercases the result', () => {
    expect(normalizeSkillName('JavaScript')).toBe('javascript');
  });

  it('handles empty and whitespace-only input', () => {
    expect(normalizeSkillName('')).toBe('');
    expect(normalizeSkillName('   ')).toBe('');
  });
});

describe('generateId', () => {
  it('returns a string in UUID format', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });
});

describe('formatDate', () => {
  it('returns a formatted date string', () => {
    // Use a fixed timestamp: Jan 15, 2025, 14:30:00 UTC
    const ts = new Date('2025-01-15T14:30:00Z').getTime();
    const result = formatDate(ts);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should contain "2025" and "Jan" (en-US format)
    expect(result).toContain('2025');
    expect(result).toContain('Jan');
  });
});
