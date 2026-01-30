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
});
