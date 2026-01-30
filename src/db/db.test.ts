import { beforeEach, describe, expect, it, vi } from 'vitest';

const openDBMock = vi.hoisted(() => vi.fn());

vi.mock('idb', () => ({
  openDB: openDBMock,
}));

import { DB_NAME, DB_VERSION, initDB, importAllData } from './db';

type FakeStoreName = 'journal' | 'skills' | 'solutions' | 'insights';

function createObjectStoreNames(names: FakeStoreName[]) {
  const set = new Set(names);
  return {
    contains: (name: string) => set.has(name as FakeStoreName),
  };
}

function createFakeDb(options?: { version?: number; stores?: FakeStoreName[] }) {
  const stores = {
    journal: [] as unknown[],
    skills: [] as unknown[],
    solutions: [] as unknown[],
    insights: [] as unknown[],
  };

  const storeNames = options?.stores ?? (Object.keys(stores) as FakeStoreName[]);

  const txStores: Partial<
    Record<
      FakeStoreName,
      {
        put: ReturnType<typeof vi.fn>;
        getAll: ReturnType<typeof vi.fn>;
      }
    >
  > = {};

  for (const name of storeNames) {
    txStores[name] = {
      put: vi.fn(async (item: unknown) => {
        stores[name].push(item);
      }),
      getAll: vi.fn(async () => stores[name]),
    };
  }

  const db = {
    version: options?.version ?? DB_VERSION,
    close: vi.fn(),
    objectStoreNames: createObjectStoreNames(storeNames),
    transaction: vi.fn(() => ({
      objectStore: (name: FakeStoreName) => {
        const store = txStores[name];
        if (!store) {
          throw new Error(`Missing store: ${name}`);
        }
        return store;
      },
      done: Promise.resolve(),
    })),
    getAll: vi.fn(async (name: FakeStoreName) => stores[name]),
    count: vi.fn(async (name: FakeStoreName) => stores[name].length),
  };

  return { db, stores, txStores };
}

beforeEach(() => {
  openDBMock.mockReset();
  localStorage.clear();
  // Ensure requestPersistence() doesn't throw in jsdom.
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      persist: vi.fn(async () => true),
    },
  });
});

describe('db/initDB', () => {
  it('falls back to open existing DB version on VersionError', async () => {
    const { db } = createFakeDb();
    openDBMock.mockImplementation(async (name: string, version?: number) => {
      if (name !== DB_NAME) throw new Error('unexpected db name');
      if (version === DB_VERSION) {
        const err = new Error('version mismatch') as Error & { name: string };
        err.name = 'VersionError';
        throw err;
      }
      return db;
    });

    const result = await initDB();
    expect(result).toBe(db);
    expect(openDBMock).toHaveBeenCalledTimes(2);
    expect(openDBMock.mock.calls[0]?.[0]).toBe(DB_NAME);
    expect(openDBMock.mock.calls[0]?.[1]).toBe(DB_VERSION);
    expect(openDBMock.mock.calls[1]?.[0]).toBe(DB_NAME);
    expect(openDBMock.mock.calls[1]?.[1]).toBeUndefined();
  });

  it('forces a schema upgrade when required stores are missing', async () => {
    const missing = createFakeDb({ version: DB_VERSION, stores: ['journal', 'skills', 'insights'] });
    const upgraded = createFakeDb({ version: DB_VERSION + 1 });

    openDBMock
      .mockResolvedValueOnce(missing.db)
      .mockResolvedValueOnce(upgraded.db);

    const result = await initDB();
    expect(result).toBe(upgraded.db);
    expect(missing.db.close).toHaveBeenCalledTimes(1);
    expect(openDBMock).toHaveBeenCalledTimes(2);
    expect(openDBMock.mock.calls[1]?.[0]).toBe(DB_NAME);
    expect(openDBMock.mock.calls[1]?.[1]).toBe(DB_VERSION + 1);
  });
});

describe('db/importAllData', () => {
  it('validates items and normalizes journal timestamp strings', async () => {
    const { db, stores } = createFakeDb();
    openDBMock.mockResolvedValue(db);

    await importAllData({
      journal: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          content: 'hello',
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'journal',
        },
        {
          id: 'not-a-uuid',
          content: '',
          timestamp: 'bad',
          type: 'journal',
        },
      ],
      skills: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'TypeScript',
          category: 'hard',
          sourceEntryIds: ['550e8400-e29b-41d4-a716-446655440000'],
          createdAt: Date.now(),
        },
      ],
      insights: [],
      solutions: [],
    });

    expect(stores.journal).toHaveLength(1);
    const journal0 = stores.journal[0] as { timestamp: unknown };
    expect(typeof journal0.timestamp).toBe('number');
    expect(Number.isFinite(journal0.timestamp)).toBe(true);

    expect(stores.skills).toHaveLength(1);
  });

  it('applies schema defaults and normalizes non-journal timestamps', async () => {
    const { db, stores } = createFakeDb();
    openDBMock.mockResolvedValue(db);

    await importAllData({
      journal: [],
      skills: [
        {
          id: '550e8400-e29b-41d4-a716-446655440010',
          name: 'Skill without sourceEntryIds',
          category: 'strength',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      solutions: [
        {
          id: '550e8400-e29b-41d4-a716-446655440011',
          problem: 'p',
          solution: 's',
          timestamp: '2026-01-03T00:00:00.000Z',
        },
      ],
      insights: [
        {
          id: '550e8400-e29b-41d4-a716-446655440012',
          entryId: '550e8400-e29b-41d4-a716-446655440013',
          timestamp: '2026-01-04T00:00:00.000Z',
        },
      ],
    });

    expect(stores.skills).toHaveLength(1);
    const skill0 = stores.skills[0] as { sourceEntryIds?: unknown; createdAt?: unknown };
    expect(skill0.sourceEntryIds).toEqual([]);
    expect(typeof skill0.createdAt).toBe('number');

    expect(stores.solutions).toHaveLength(1);
    const solution0 = stores.solutions[0] as { timestamp?: unknown };
    expect(typeof solution0.timestamp).toBe('number');

    expect(stores.insights).toHaveLength(1);
    const insight0 = stores.insights[0] as {
      timestamp?: unknown;
      archetypes?: unknown;
      hiddenPatterns?: unknown;
      criticalQuestions?: unknown;
    };
    expect(typeof insight0.timestamp).toBe('number');
    expect(insight0.archetypes).toEqual([]);
    expect(insight0.hiddenPatterns).toEqual([]);
    expect(insight0.criticalQuestions).toEqual([]);
  });
});

describe('db/recoverFromMirror', () => {
  it('does not overwrite when DB already has data', async () => {
    const { db, stores } = createFakeDb();
    openDBMock.mockResolvedValue(db);
    stores.skills.push({
      id: '550e8400-e29b-41d4-a716-446655440020',
      name: 'existing',
      category: 'strength',
      sourceEntryIds: [],
      createdAt: Date.now(),
    });

    localStorage.setItem(
      'MYSTATS_MIRROR_SKILLS',
      JSON.stringify([
        {
          id: '550e8400-e29b-41d4-a716-446655440021',
          name: 'mirror-skill',
          category: 'strength',
          sourceEntryIds: [],
          createdAt: Date.now(),
        },
      ])
    );

    const { recoverFromMirror } = await import('./db');
    const recovered = await recoverFromMirror();
    expect(recovered).toBe(false);
    expect(stores.skills).toHaveLength(1);
  });
});
