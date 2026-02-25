import { describe, it, expect, beforeEach } from 'vitest';
import { buildDebugReport } from './debug';

describe('debug/buildDebugReport', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('includes cloudSync defaults when not configured', () => {
    const report = buildDebugReport();
    expect(report.cloudSync).toEqual({
      enabled: false,
      autoSync: true,
      lastSyncedAt: null,
      cooldownUntil: null,
      lastResultOk: null,
    });
  });

  it('includes cloudSync values from localStorage when present', () => {
    localStorage.setItem(
      'MYSTATS_CLOUD_SYNC_CONFIG_V1',
      JSON.stringify({ enabled: true, autoSync: false })
    );
    localStorage.setItem('MYSTATS_CLOUD_SYNC_LAST_SYNC_V1', '1700000000000');

    const report = buildDebugReport();
    expect(report.cloudSync).toEqual({
      enabled: true,
      autoSync: false,
      lastSyncedAt: 1700000000000,
      cooldownUntil: null,
      lastResultOk: null,
    });
  });

  it('tolerates invalid cloudSync JSON', () => {
    localStorage.setItem('MYSTATS_CLOUD_SYNC_CONFIG_V1', '{bad json');
    const report = buildDebugReport();
    expect(report.cloudSync).toEqual({
      enabled: false,
      autoSync: true,
      lastSyncedAt: null,
      cooldownUntil: null,
      lastResultOk: null,
    });
  });
});
