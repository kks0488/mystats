import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let warnedAboutInvalidKey = false;

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const base64 = `${normalized}${padding}`;

  if (typeof atob === 'function') return atob(base64);
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function getJwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadJson = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const role = payload.role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

export function isLikelySupabaseServiceRoleKey(key: string): boolean {
  const raw = (key || '').trim();
  if (!raw) return false;
  if (raw.startsWith('sb_secret_')) return true;
  if (raw.startsWith('eyJ')) return getJwtRole(raw) === 'service_role';
  return false;
}

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  const keyStr = String(key);
  if (isLikelySupabaseServiceRoleKey(keyStr)) {
    if (!warnedAboutInvalidKey) {
      warnedAboutInvalidKey = true;
      console.error(
        '[Cloud Sync] Refusing to initialize Supabase with a secret/service_role key. Use a public anon/publishable key instead.'
      );
    }
    return false;
  }

  return true;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cachedClient) return cachedClient;

  const url = String(import.meta.env.VITE_SUPABASE_URL);
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY);

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return cachedClient;
}
