import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { getCloudSyncConfig, syncNowWithRetry } from '@/lib/cloudSync';

let started = false;
let timer: number | null = null;

function scheduleSync(delayMs = 1500) {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    const config = getCloudSyncConfig();
    if (!config.enabled || !config.autoSync) return;
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

  window.addEventListener('mystats-data-updated', onDataUpdate);
  window.addEventListener('online', onOnline);

  return () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    window.removeEventListener('mystats-data-updated', onDataUpdate);
    window.removeEventListener('online', onOnline);
    sub?.data.subscription.unsubscribe();
    started = false;
  };
}
