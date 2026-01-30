import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '@/lib/supabase';
import { getCloudLastSyncedAt, getCloudSyncConfig, setCloudSyncConfig, syncNow } from './cloudSync';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getSupabaseClient).mockReset();
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
});

