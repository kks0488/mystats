import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { getCloudSyncConfig, getCloudSyncCooldownUntil, syncNowWithRetry } from '@/lib/cloudSync';

let started = false;
let timer: number | null = null;

function scheduleSync(delayMs = 1500) {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    const config = getCloudSyncConfig();
    if (!config.enabled || !config.autoSync) return;
    const cooldownUntil = getCloudSyncCooldownUntil();
    if (cooldownUntil && cooldownUntil > Date.now()) {
      const nextDelay = Math.min(30_000, Math.max(500, cooldownUntil - Date.now() + 250));
      scheduleSync(nextDelay);
      return;
    }
    void (async () => {
      try {
        await syncNowWithRetry();
      } catch (error) {
        console.debug('[CloudSync] auto-sync skipped:', error instanceof Error ? error.message : error);
      }
    })();
  }, delayMs);
}

export function startCloudSyncManager(): () => void {
  if (started) return () => {};
  started = true;

  if (!isSupabaseConfigured()) {
    started = false;
    return () => {};
  }

  const supabase = getSupabaseClient();
  const sub = supabase?.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      scheduleSync(250);
    }
  });

  const onDataUpdate = () => scheduleSync(2000);
  const onOnline = () => scheduleSync(500);
  const onSyncStatus = (event: Event) => {
    const detail = (event as CustomEvent<{ phase?: string; cooldownUntil?: number }>).detail;
    if (!detail || detail.phase !== 'cooldown') return;
    const cooldownUntil = typeof detail.cooldownUntil === 'number' ? detail.cooldownUntil : null;
    if (!cooldownUntil || cooldownUntil <= Date.now()) return;
    const nextDelay = Math.min(30_000, Math.max(500, cooldownUntil - Date.now() + 250));
    scheduleSync(nextDelay);
  };

  window.addEventListener('mystats-data-updated', onDataUpdate);
  window.addEventListener('online', onOnline);
  window.addEventListener('mystats-cloud-sync-status', onSyncStatus as EventListener);

  return () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    window.removeEventListener('mystats-data-updated', onDataUpdate);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('mystats-cloud-sync-status', onSyncStatus as EventListener);
    sub?.data.subscription.unsubscribe();
    started = false;
  };
}
