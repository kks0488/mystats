import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateMirrorMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/db/db', async () => {
  const { z } = await import('zod');
  const ts = z.union([
    z.number().finite(),
    z.string().transform((v) => new Date(v).getTime()).pipe(z.number().finite()),
  ]);
  return {
    getDB: async () => {
      throw new Error('db unavailable');
    },
    deleteJournalEntryCascade: vi.fn(async () => ({ deleted: false, deletedInsightIds: [], deletedSkillIds: [] })),
    updateMirror: updateMirrorMock,
    JournalEntrySchema: z
      .object({
        id: z.string().uuid(),
        content: z.string().min(1),
        timestamp: ts,
        type: z.enum(['journal', 'project']),
        lastModified: ts.optional(),
      })
      .passthrough(),
    SkillSchema: z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1),
        category: z.string(),
        sourceEntryIds: z.array(z.string()).default([]),
        createdAt: ts,
        lastModified: ts.optional(),
      })
      .passthrough(),
    InsightSchema: z
      .object({
        id: z.string().uuid(),
        entryId: z.string().uuid(),
        timestamp: ts,
        archetypes: z.array(z.string()).default([]),
        hiddenPatterns: z.array(z.string()).default([]),
        criticalQuestions: z.array(z.string()).default([]),
      })
      .passthrough(),
    SolutionSchema: z
      .object({
        id: z.string().uuid(),
        problem: z.string().min(1),
        solution: z.string().min(1),
        timestamp: ts,
      })
      .passthrough(),
  };
});

import { getSupabaseClient } from '@/lib/supabase';
import {
  getCloudLastSyncResult,
  getCloudLastSyncedAt,
  getCloudSyncConfig,
  setCloudSyncConfig,
  syncNow,
  syncNowWithRetry,
} from './cloudSync';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getSupabaseClient).mockReset();
  updateMirrorMock.mockClear();
});

describe('cloudSync config', () => {
  it('returns defaults when storage is empty', () => {
    expect(getCloudSyncConfig()).toEqual({ enabled: false, autoSync: true });
    expect(getCloudLastSyncedAt()).toBeNull();
  });

  it('persists partial updates via setCloudSyncConfig', () => {
    const next = setCloudSyncConfig({ enabled: true });
    expect(next.enabled).toBe(true);
    expect(getCloudSyncConfig().enabled).toBe(true);
  });
});

describe('syncNow', () => {
  it('returns not_configured when supabase client is missing', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    const result = await syncNow();
    expect(result.ok).toBe(false);
    expect(result.mode).toBe('not_configured');
  });

  it('scopes reads and writes by signed-in user id', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';

    // Seed minimal fallback data so syncNow has something to upsert.
    localStorage.setItem(
      'MYSTATS_FALLBACK_JOURNAL',
      JSON.stringify([
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          content: 'hello',
          timestamp: 1700000000000,
          type: 'journal',
        },
      ])
    );

    const eqSpy = vi.fn(async () => ({ data: [], error: null }));
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));
    const upsertSpy = vi.fn(async () => ({ error: null }));
    const fromSpy = vi.fn(() => ({ select: selectSpy, upsert: upsertSpy }));

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: userId } } }, error: null })),
      },
      from: fromSpy,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await syncNow();
    expect(result.ok).toBe(true);

    // Read is scoped to user_id.
    expect(selectSpy).toHaveBeenCalledWith('kind,id,payload,last_modified,deleted');
    expect(eqSpy).toHaveBeenCalledWith('user_id', userId);

    // Upserts are scoped to user_id and use the expected conflict key.
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const call = (upsertSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call).toBeTruthy();
    const rowsArg = (call?.[0]) as unknown;
    const optsArg = (call?.[1]) as unknown;
    expect(optsArg).toEqual({ onConflict: 'user_id,kind,id' });
    expect(Array.isArray(rowsArg)).toBe(true);
    for (const row of rowsArg as Array<Record<string, unknown>>) {
      expect(row.user_id).toBe(userId);
    }
  });

  it('applies remote tombstones (deleted=true) to local fallback data', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const entryId = '550e8400-e29b-41d4-a716-446655440010';
    const now = Date.now();

    localStorage.setItem(
      'MYSTATS_FALLBACK_JOURNAL',
      JSON.stringify([
        {
          id: entryId,
          content: 'hello',
          timestamp: now - 10_000,
          type: 'journal',
          lastModified: now - 10_000,
        },
      ])
    );

    const remoteRows = [
      { kind: 'journal', id: entryId, payload: {}, last_modified: now - 1000, deleted: true },
    ];

    const eqSpy = vi.fn(async () => ({ data: remoteRows, error: null }));
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));
    const upsertSpy = vi.fn(async () => ({ error: null }));
    const fromSpy = vi.fn(() => ({ select: selectSpy, upsert: upsertSpy }));

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: userId } } }, error: null })),
      },
      from: fromSpy,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await syncNow();
    expect(result.ok).toBe(true);

    const stored = JSON.parse(localStorage.getItem('MYSTATS_FALLBACK_JOURNAL') || '[]') as Array<{ id?: string }>;
    expect(stored.some((item) => item.id === entryId)).toBe(false);

    const tombstones = JSON.parse(localStorage.getItem('MYSTATS_TOMBSTONES_V1') || '[]') as Array<{ kind?: string; id?: string }>;
    expect(tombstones.some((t) => t.kind === 'journal' && t.id === entryId)).toBe(true);

    // Remote already has the tombstone; nothing to push back.
    expect(upsertSpy).toHaveBeenCalledTimes(0);
  });

  it('does not resurrect items older than a local tombstone and pushes the tombstone', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const entryId = '550e8400-e29b-41d4-a716-446655440011';
    const now = Date.now();

    localStorage.setItem('MYSTATS_TOMBSTONES_V1', JSON.stringify([{ kind: 'journal', id: entryId, lastModified: now }]));

    const remoteRows = [
      {
        kind: 'journal',
        id: entryId,
        payload: { id: entryId, content: 'remote', timestamp: now - 10_000, type: 'journal' },
        last_modified: now - 1,
        deleted: false,
      },
    ];

    const eqSpy = vi.fn(async () => ({ data: remoteRows, error: null }));
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));
    const upsertSpy = vi.fn(async () => ({ error: null }));
    const fromSpy = vi.fn(() => ({ select: selectSpy, upsert: upsertSpy }));

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: userId } } }, error: null })),
      },
      from: fromSpy,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await syncNow();
    expect(result.ok).toBe(true);

    const stored = JSON.parse(localStorage.getItem('MYSTATS_FALLBACK_JOURNAL') || '[]') as unknown[];
    expect(stored).toEqual([]);

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [rowsArg] = (upsertSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const rows = rowsArg as Array<Record<string, unknown>>;
    const row = rows.find((r) => r.kind === 'journal' && r.id === entryId);
    expect(row?.deleted).toBe(true);
    expect(row?.last_modified).toBe(now);
  });

  it('does not push solutions tombstones when running in fallback mode', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const solutionId = '550e8400-e29b-41d4-a716-446655440099';
    const now = Date.now();

    localStorage.setItem('MYSTATS_TOMBSTONES_V1', JSON.stringify([{ kind: 'solutions', id: solutionId, lastModified: now }]));

    const eqSpy = vi.fn(async () => ({ data: [], error: null }));
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));
    const upsertSpy = vi.fn(async () => ({ error: null }));
    const fromSpy = vi.fn(() => ({ select: selectSpy, upsert: upsertSpy }));

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: userId } } }, error: null })),
      },
      from: fromSpy,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await syncNow();
    expect(result.ok).toBe(true);

    expect(upsertSpy).toHaveBeenCalledTimes(0);
  });

  it('pushes local items newer than remote tombstones (undelete)', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const entryId = '550e8400-e29b-41d4-a716-446655440012';
    const now = Date.now();

    localStorage.setItem(
      'MYSTATS_FALLBACK_JOURNAL',
      JSON.stringify([
        {
          id: entryId,
          content: 'local',
          timestamp: now - 10_000,
          type: 'journal',
          lastModified: now,
        },
      ])
    );

    const remoteRows = [
      { kind: 'journal', id: entryId, payload: {}, last_modified: now - 1, deleted: true },
    ];

    const eqSpy = vi.fn(async () => ({ data: remoteRows, error: null }));
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));
    const upsertSpy = vi.fn(async () => ({ error: null }));
    const fromSpy = vi.fn(() => ({ select: selectSpy, upsert: upsertSpy }));

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: userId } } }, error: null })),
      },
      from: fromSpy,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await syncNow();
    expect(result.ok).toBe(true);

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [rowsArg] = (upsertSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const rows = rowsArg as Array<Record<string, unknown>>;
    const row = rows.find((r) => r.kind === 'journal' && r.id === entryId);
    expect(row?.deleted).toBe(false);
    expect(row?.last_modified).toBe(now);
  });
});

describe('syncNowWithRetry', () => {
  it('retries transient network failures and succeeds with retryCount', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';

    const eqSpy = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'Network timeout' } })
      .mockResolvedValueOnce({ data: [], error: null });
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));
    const upsertSpy = vi.fn(async () => ({ error: null }));
    const fromSpy = vi.fn(() => ({ select: selectSpy, upsert: upsertSpy }));

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: userId } } }, error: null })),
      },
      from: fromSpy,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await syncNowWithRetry({ attempts: 3, baseDelayMs: 1, cooldownMs: 5000 });
    expect(result.ok).toBe(true);
    expect(result.retryCount).toBe(2);
    expect(eqSpy).toHaveBeenCalledTimes(3);

    const lastResult = getCloudLastSyncResult();
    expect(lastResult?.ok).toBe(true);
    expect(lastResult?.retryCount).toBe(2);
  });

  it('enters cooldown after repeated retryable failures', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';

    const eqSpy = vi.fn(async () => ({ data: null, error: { message: 'Failed to fetch' } }));
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));
    const upsertSpy = vi.fn(async () => ({ error: null }));
    const fromSpy = vi.fn(() => ({ select: selectSpy, upsert: upsertSpy }));

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: userId } } }, error: null })),
      },
      from: fromSpy,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await syncNowWithRetry({ attempts: 3, baseDelayMs: 1, cooldownMs: 5000 });
    expect(result.ok).toBe(false);
    expect(result.retryCount).toBe(2);
    expect(result.failureCode).toBe('network');
    expect(typeof result.cooldownUntil).toBe('number');
    expect((result.cooldownUntil ?? 0) > Date.now()).toBe(true);

    const inCooldown = await syncNowWithRetry({ attempts: 3, baseDelayMs: 1, cooldownMs: 5000 });
    expect(inCooldown.ok).toBe(false);
    expect(inCooldown.message).toContain('cooldown');
    expect(inCooldown.failureCode).toBe('network');
  });

  it('emits cloud sync status events for start/retry/success', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';

    const eqSpy = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ data: [], error: null });
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));
    const upsertSpy = vi.fn(async () => ({ error: null }));
    const fromSpy = vi.fn(() => ({ select: selectSpy, upsert: upsertSpy }));

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: userId } } }, error: null })),
      },
      from: fromSpy,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const phases: string[] = [];
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ phase?: string }>).detail;
      if (detail?.phase) phases.push(detail.phase);
    };
    window.addEventListener('mystats-cloud-sync-status', onStatus as EventListener);

    try {
      const result = await syncNowWithRetry({ attempts: 2, baseDelayMs: 1, cooldownMs: 5000 });
      expect(result.ok).toBe(true);
    } finally {
      window.removeEventListener('mystats-cloud-sync-status', onStatus as EventListener);
    }

    expect(phases).toContain('start');
    expect(phases).toContain('retry');
    expect(phases).toContain('success');
  });
});
