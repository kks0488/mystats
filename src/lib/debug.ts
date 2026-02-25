import { getAIConfig } from './ai-provider';
import { getMemuConfig } from './memu';
import { getFallbackStorageMode } from '../db/fallback';

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageGetNumber(key: string): number | null {
  const raw = safeLocalStorageGet(key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function safeParseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function buildDebugReport(): Record<string, unknown> {
  const ai = (() => {
    try {
      const config = getAIConfig();
      return {
        provider: config.provider,
        model: config.model || null,
        apiKeyPresent: Boolean(config.apiKey),
      };
    } catch {
      return { provider: null, model: null, apiKeyPresent: null };
    }
  })();

  const memu = (() => {
    try {
      const config = getMemuConfig();
      return {
        enabled: config.enabled,
        engine: config.engine,
        baseUrl: config.engine === 'api' ? config.baseUrl : null,
        userId: config.userId,
        storeJournal: config.storeJournal,
        useInStrategy: config.useInStrategy,
        includeProjectRegistryInStrategy: config.includeProjectRegistryInStrategy,
        dedupeBeforeStore: config.dedupeBeforeStore,
        dedupeThreshold: config.dedupeThreshold,
      };
    } catch {
      return null;
    }
  })();

  const storage = (() => {
    try {
      return { fallbackMode: getFallbackStorageMode() };
    } catch {
      return { fallbackMode: null };
    }
  })();

  const cloudSync = (() => {
    const raw = safeLocalStorageGet('MYSTATS_CLOUD_SYNC_CONFIG_V1');
    const parsed = safeParseJson(raw);
    const lastResult = safeParseJson(safeLocalStorageGet('MYSTATS_CLOUD_SYNC_LAST_RESULT_V1'));
    return {
      enabled: parsed ? Boolean(parsed.enabled) : false,
      autoSync: parsed && 'autoSync' in parsed ? Boolean(parsed.autoSync) : true,
      lastSyncedAt: safeLocalStorageGetNumber('MYSTATS_CLOUD_SYNC_LAST_SYNC_V1'),
      cooldownUntil: safeLocalStorageGetNumber('MYSTATS_CLOUD_SYNC_COOLDOWN_UNTIL_V1'),
      lastResultOk: lastResult ? Boolean((lastResult as Record<string, unknown>).ok ?? (lastResult as Record<string, unknown>).success) : null,
    };
  })();

  return {
    generatedAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    pathname: typeof window !== 'undefined' ? window.location.pathname : null,
    platform: typeof navigator !== 'undefined' ? ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform) : null,
    language: safeLocalStorageGet('app_lang'),
    ai,
    memu,
    storage,
    cloudSync,
  };
}

export function getDebugReportText(): string {
  return JSON.stringify(buildDebugReport(), null, 2);
}
