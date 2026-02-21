import { migrateData, recoverFromMirror } from '@/db/db';
import { getSupabaseClient } from '@/lib/supabase';

const CLOUD_SYNC_CONFIG_KEY = 'MYSTATS_CLOUD_SYNC_CONFIG_V1';

function isSupabaseEnvConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function hasAuthFragment(hash: string): boolean {
  return /access_token=|refresh_token=|provider_token=|expires_in=|token_type=/.test(hash);
}

async function maybeInitSentry(): Promise<void> {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  const { initSentry } = await import('@/lib/sentry');
  await initSentry();
}

async function maybeHandleOAuthRedirectHash(): Promise<void> {
  if (!isSupabaseEnvConfigured()) return;
  const supabase = getSupabaseClient();
  const hash = window.location.hash || '';
  if (!supabase || !hasAuthFragment(hash)) return;

  await supabase.auth.getSession().catch(() => null);
  try {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  } catch {
    // ignore
  }
}

export async function bootstrapAppInfra(): Promise<void> {
  await maybeInitSentry();
  await migrateData();
  await recoverFromMirror();
  await maybeHandleOAuthRedirectHash();
}

export async function startCloudSyncIfEnabled(): Promise<() => void> {
  if (!isSupabaseEnvConfigured()) return () => {};

  let enabled = false;
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_CONFIG_KEY);
    if (raw) enabled = Boolean(JSON.parse(raw)?.enabled);
  } catch {
    enabled = false;
  }
  if (!enabled) return () => {};

  const { startCloudSyncManager } = await import('@/lib/cloudSyncManager');
  return startCloudSyncManager();
}
