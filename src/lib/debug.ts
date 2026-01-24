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

  return {
    generatedAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    location: typeof window !== 'undefined' ? window.location.href : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    language: safeLocalStorageGet('app_lang'),
    ai,
    memu,
    storage,
  };
}

export function getDebugReportText(): string {
  return JSON.stringify(buildDebugReport(), null, 2);
}

