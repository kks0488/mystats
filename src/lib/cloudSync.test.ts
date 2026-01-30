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
import { getCloudLastSyncedAt, getCloudSyncConfig, setCloudSyncConfig, syncNow } from './cloudSync';

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
});
