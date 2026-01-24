import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/db', () => ({
  getDB: vi.fn(),
}));

vi.mock('../db/fallback', () => ({
  loadFallbackJournalEntries: () => [],
}));

import { getDB } from '../db/db';
import { memuCheckSimilar, memuCreateItem, memuHealth, memuRetrieve, type MemuConfig } from './memu';

const baseConfig: MemuConfig = {
  enabled: true,
  engine: 'embedded',
  baseUrl: '/api/memu',
  userId: 'mystats',
  storeJournal: true,
  useInStrategy: true,
  includeProjectRegistryInStrategy: false,
  dedupeBeforeStore: true,
  dedupeThreshold: 0.92,
};

describe('memU (embedded engine)', () => {
  const mockedGetDB = vi.mocked(getDB);

  beforeEach(() => {
    mockedGetDB.mockReset();
  });

  it('memuHealth returns true when enabled', async () => {
    await expect(memuHealth(baseConfig)).resolves.toBe(true);
  });

  it('retrieve returns top-K most similar journal entries', async () => {
    const now = Date.now();
    const entries = [
      { id: 'a', content: 'hello world', timestamp: now - 1000, type: 'journal', lastModified: now - 1000 },
      { id: 'b', content: 'hello there', timestamp: now - 2000, type: 'journal', lastModified: now - 2000 },
      { id: 'c', content: 'completely different topic', timestamp: now - 3000, type: 'journal', lastModified: now - 3000 },
    ];

    mockedGetDB.mockResolvedValue({
      getAll: vi.fn(async () => entries),
    } as unknown as Awaited<ReturnType<typeof getDB>>);

    const res = await memuRetrieve('hello world', baseConfig, { topK: 2 });
    expect(res?.success).toBe(true);
    expect(res?.items).toHaveLength(2);
    expect(res?.items[0]?.id).toBe('a');
    expect(res?.items[0]?.user_id).toBe('mystats');

    const score0 = res?.items[0]?.score ?? 0;
    const score1 = res?.items[1]?.score ?? 0;
    expect(score0).toBeGreaterThanOrEqual(score1);
    expect(score0).toBeGreaterThan(0.9);
  });

  it('retrieve returns no items when userId scope mismatches', async () => {
    mockedGetDB.mockResolvedValue({
      getAll: vi.fn(async () => [{ id: 'a', content: 'hello world', timestamp: Date.now(), type: 'journal' }]),
    } as unknown as Awaited<ReturnType<typeof getDB>>);

    const res = await memuRetrieve('hello', baseConfig, { userId: 'someone-else' });
    expect(res?.success).toBe(true);
    expect(res?.items).toHaveLength(0);
    expect(res?.message.toLowerCase()).toContain('scope');
  });

  it('checkSimilar flags near-identical content above threshold', async () => {
    const now = Date.now();
    const entries = [{ id: 'a', content: 'same content', timestamp: now, type: 'journal', lastModified: now }];

    mockedGetDB.mockResolvedValue({
      getAll: vi.fn(async () => entries),
    } as unknown as Awaited<ReturnType<typeof getDB>>);

    const res = await memuCheckSimilar('same content', baseConfig, { threshold: 0.95 });
    expect(res?.is_similar).toBe(true);
    expect(res?.similar_items?.[0]?.id).toBe('a');
    expect(res?.similarity_score).toBeGreaterThan(0.95);
  });

  it('createItem is a no-op in embedded mode', async () => {
    await expect(memuCreateItem('anything', baseConfig)).resolves.toBeNull();
  });
});

