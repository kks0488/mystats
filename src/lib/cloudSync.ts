import type { IDBPDatabase } from 'idb';
import {
  getDB,
  InsightSchema,
  JournalEntrySchema,
  SkillSchema,
  SolutionSchema,
  updateMirror,
  type Insight,
  type JournalEntry,
  type MyStatsDB,
  type Skill,
  type Solution,
} from '@/db/db';
import {
  getFallbackStorageMode,
  loadFallbackInsights,
  loadFallbackJournalEntries,
  loadFallbackSkills,
  replaceFallbackInsights,
  replaceFallbackJournalEntries,
  replaceFallbackSkills,
} from '@/db/fallback';
import { getSupabaseClient } from '@/lib/supabase';

export type CloudSyncKind = 'journal' | 'skills' | 'solutions' | 'insights';

export interface CloudSyncConfig {
  enabled: boolean;
  autoSync: boolean;
}

const CLOUD_SYNC_STORAGE_KEY = 'MYSTATS_CLOUD_SYNC_CONFIG_V1';
const CLOUD_SYNC_LAST_SYNC_KEY = 'MYSTATS_CLOUD_SYNC_LAST_SYNC_V1';

const DEFAULT_CONFIG: CloudSyncConfig = {
  enabled: false,
  autoSync: true,
};

export function getCloudSyncConfig(): CloudSyncConfig {
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<CloudSyncConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      autoSync: parsed.autoSync !== undefined ? Boolean(parsed.autoSync) : DEFAULT_CONFIG.autoSync,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function setCloudSyncConfig(patch: Partial<CloudSyncConfig>): CloudSyncConfig {
  const next = { ...getCloudSyncConfig(), ...patch };
  try {
    localStorage.setItem(CLOUD_SYNC_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('mystats-cloud-sync-config'));
  return next;
}

export function getCloudLastSyncedAt(): number | null {
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_LAST_SYNC_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function setCloudLastSyncedAt(ts: number): void {
  try {
    localStorage.setItem(CLOUD_SYNC_LAST_SYNC_KEY, String(ts));
  } catch {
    // ignore
  }
}

type RemoteItemRow = {
  user_id: string;
  kind: CloudSyncKind;
  id: string;
  payload: unknown;
  last_modified: number;
  deleted: boolean;
};

type LocalSnapshot = {
  mode: 'db' | 'fallback' | 'memory';
  journal: JournalEntry[];
  skills: Skill[];
  insights: Insight[];
  solutions: Solution[];
};

function getItemLastModified(kind: CloudSyncKind, item: unknown): number {
  const record = item as Record<string, unknown>;
  const lastModified =
    typeof record.lastModified === 'number'
      ? record.lastModified
      : kind === 'skills' && typeof record.createdAt === 'number'
        ? (record.createdAt as number)
        : kind === 'insights' && typeof record.timestamp === 'number'
          ? (record.timestamp as number)
          : kind === 'solutions' && typeof record.timestamp === 'number'
            ? (record.timestamp as number)
            : kind === 'journal' && typeof record.timestamp === 'number'
              ? (record.timestamp as number)
              : 0;
  return Number.isFinite(lastModified) ? lastModified : 0;
}

async function readLocalSnapshot(): Promise<LocalSnapshot> {
  try {
    const db = await getDB();
    const [journal, skills, insights, solutions] = await Promise.all([
      db.getAll('journal'),
      db.getAll('skills'),
      db.getAll('insights'),
      db.getAll('solutions'),
    ]);
    return { mode: 'db', journal, skills, insights, solutions };
  } catch {
    const mode = getFallbackStorageMode() === 'memory' ? 'memory' : 'fallback';
    return {
      mode,
      journal: loadFallbackJournalEntries(),
      skills: loadFallbackSkills(),
      insights: loadFallbackInsights(),
      solutions: [],
    };
  }
}

async function applyRemoteToDb(
  db: IDBPDatabase<MyStatsDB>,
  updates: { journal: JournalEntry[]; skills: Skill[]; insights: Insight[]; solutions: Solution[] }
): Promise<void> {
  const tx = db.transaction(['journal', 'skills', 'insights', 'solutions'], 'readwrite');
  await Promise.all([
    Promise.all(updates.journal.map((item) => tx.objectStore('journal').put(item))),
    Promise.all(updates.skills.map((item) => tx.objectStore('skills').put(item))),
    Promise.all(updates.insights.map((item) => tx.objectStore('insights').put(item))),
    Promise.all(updates.solutions.map((item) => tx.objectStore('solutions').put(item))),
  ]);
  await tx.done;
  await updateMirror();
}

function applyRemoteToFallback(
  current: LocalSnapshot,
  updates: { journal: JournalEntry[]; skills: Skill[]; insights: Insight[] }
): void {
  // Fallback stores have their own merge/dedupe behavior.
  replaceFallbackJournalEntries([...current.journal, ...updates.journal]);
  replaceFallbackSkills([...current.skills, ...updates.skills]);
  replaceFallbackInsights([...current.insights, ...updates.insights]);
}

export async function cloudSignInWithOAuth(
  provider: 'google' | 'github'
): Promise<{ ok: boolean; message?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      // Important: return directly to a route that mounts Cloud Sync UI, so the app
      // can process `#access_token=...` before React Router navigation clears it.
      redirectTo: `${window.location.origin}/settings`,
    },
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function cloudSignInWithPassword(
  email: string,
  password: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };
  const trimmedEmail = (email || '').trim();
  const trimmedPassword = password || '';
  if (!trimmedEmail) return { ok: false, message: 'Email required.' };
  if (!trimmedPassword) return { ok: false, message: 'Password required.' };

  const { error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password: trimmedPassword,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function cloudSignUpWithPassword(
  email: string,
  password: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };
  const trimmedEmail = (email || '').trim();
  const trimmedPassword = password || '';
  if (!trimmedEmail) return { ok: false, message: 'Email required.' };
  if (!trimmedPassword) return { ok: false, message: 'Password required.' };

  const { error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password: trimmedPassword,
    options: {
      emailRedirectTo: `${window.location.origin}/settings`,
    },
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function cloudSignOut(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCloudUserEmail(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user?.email;
  return typeof email === 'string' ? email : null;
}

export type CloudUserInfo = {
  id: string;
  email: string | null;
  provider: string | null;
};

export async function getCloudUserInfo(): Promise<CloudUserInfo | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user?.id) return null;

  const email = typeof user.email === 'string' ? user.email : null;
  const provider =
    typeof (user.app_metadata as Record<string, unknown> | null | undefined)?.provider === 'string'
      ? ((user.app_metadata as Record<string, unknown>).provider as string)
      : null;

  return { id: user.id, email, provider };
}

export async function syncNow(): Promise<{
  ok: boolean;
  appliedRemote: number;
  pushedLocal: number;
  mode: LocalSnapshot['mode'] | 'signed_out' | 'not_configured';
  message?: string;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, appliedRemote: 0, pushedLocal: 0, mode: 'not_configured', message: 'Supabase not configured' };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { ok: false, appliedRemote: 0, pushedLocal: 0, mode: 'signed_out', message: sessionError.message };
  }

  const user = sessionData.session?.user;
  if (!user) {
    return { ok: false, appliedRemote: 0, pushedLocal: 0, mode: 'signed_out', message: 'Not signed in' };
  }

  const local = await readLocalSnapshot();

  const { data: remoteRows, error: remoteError } = await supabase
    .from('mystats_items')
    .select('kind,id,payload,last_modified,deleted')
    .eq('user_id', user.id);

  if (remoteError) {
    return { ok: false, appliedRemote: 0, pushedLocal: 0, mode: local.mode, message: remoteError.message };
  }

  const remote = (remoteRows || []) as Array<Omit<RemoteItemRow, 'user_id'> & { user_id?: string }>;
  const remoteMap = new Map<string, Omit<RemoteItemRow, 'user_id'>>();
  for (const row of remote) {
    if (!row || typeof row !== 'object') continue;
    const kind = row.kind as CloudSyncKind;
    const id = String(row.id || '');
    if (!id) continue;
    remoteMap.set(`${kind}:${id}`, {
      kind,
      id,
      payload: row.payload,
      last_modified: Number(row.last_modified) || 0,
      deleted: Boolean(row.deleted),
    });
  }

  const localByKind: Record<CloudSyncKind, Map<string, unknown>> = {
    journal: new Map(local.journal.map((i) => [i.id, i])),
    skills: new Map(local.skills.map((i) => [i.id, i])),
    insights: new Map(local.insights.map((i) => [i.id, i])),
    solutions: new Map(local.solutions.map((i) => [i.id, i])),
  };

  const apply: { journal: JournalEntry[]; skills: Skill[]; insights: Insight[]; solutions: Solution[] } = {
    journal: [],
    skills: [],
    insights: [],
    solutions: [],
  };

  let appliedRemote = 0;
  for (const item of remoteMap.values()) {
    if (item.deleted) continue; // Tombstones handled in a later iteration
    const localExisting = localByKind[item.kind].get(item.id);
    const localLm = localExisting ? getItemLastModified(item.kind, localExisting) : 0;
    if (!localExisting || item.last_modified > localLm) {
      const payload = item.payload as unknown;
      if (!payload || typeof payload !== 'object') continue;
      if (item.kind === 'journal') {
        const parsed = JournalEntrySchema.safeParse(payload);
        if (!parsed.success) continue;
        apply.journal.push(parsed.data);
        appliedRemote += 1;
      } else if (item.kind === 'skills') {
        const parsed = SkillSchema.safeParse(payload);
        if (!parsed.success) continue;
        apply.skills.push(parsed.data);
        appliedRemote += 1;
      } else if (item.kind === 'insights') {
        const parsed = InsightSchema.safeParse(payload);
        if (!parsed.success) continue;
        apply.insights.push(parsed.data);
        appliedRemote += 1;
      } else if (item.kind === 'solutions') {
        const parsed = SolutionSchema.safeParse(payload);
        if (!parsed.success) continue;
        apply.solutions.push(parsed.data);
        appliedRemote += 1;
      }
    }
  }

  if (appliedRemote > 0) {
    if (local.mode === 'db') {
      const db = await getDB();
      await applyRemoteToDb(db, apply);
    } else {
      applyRemoteToFallback(local, { journal: apply.journal, skills: apply.skills, insights: apply.insights });
    }
    window.dispatchEvent(new Event('mystats-data-updated'));
  }

  // Push local changes that are newer than remote.
  const upserts: RemoteItemRow[] = [];
  const kinds: CloudSyncKind[] = ['journal', 'skills', 'insights', 'solutions'];
  for (const kind of kinds) {
    // In fallback mode, we don't have solutions.
    if (local.mode !== 'db' && kind === 'solutions') continue;
    const items = Array.from(localByKind[kind].values());
    for (const item of items) {
      const record = item as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : '';
      if (!id) continue;

      const parsedPayload = (() => {
        if (kind === 'journal') {
          const parsed = JournalEntrySchema.safeParse(item);
          return parsed.success ? parsed.data : null;
        }
        if (kind === 'skills') {
          const parsed = SkillSchema.safeParse(item);
          return parsed.success ? parsed.data : null;
        }
        if (kind === 'insights') {
          const parsed = InsightSchema.safeParse(item);
          return parsed.success ? parsed.data : null;
        }
        if (kind === 'solutions') {
          const parsed = SolutionSchema.safeParse(item);
          return parsed.success ? parsed.data : null;
        }
        return null;
      })();
      if (!parsedPayload) continue;
      const localLm = getItemLastModified(kind, item);
      const remoteLm = remoteMap.get(`${kind}:${id}`)?.last_modified ?? 0;
      if (remoteLm === 0 || localLm > remoteLm) {
        upserts.push({
          user_id: user.id,
          kind,
          id,
          payload: parsedPayload,
          last_modified: localLm || Date.now(),
          deleted: false,
        });
      }
    }
  }

  let pushedLocal = 0;
  if (upserts.length > 0) {
    const { error: upsertError } = await supabase.from('mystats_items').upsert(upserts, {
      onConflict: 'user_id,kind,id',
    });
    if (upsertError) {
      return { ok: false, appliedRemote, pushedLocal: 0, mode: local.mode, message: upsertError.message };
    }
    pushedLocal = upserts.length;
  }

  setCloudLastSyncedAt(Date.now());
  return { ok: true, appliedRemote, pushedLocal, mode: local.mode };
}

function isRetryableSyncMessage(message?: string): boolean {
  const raw = (message || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw.includes('not configured')) return false;
  if (raw.includes('not signed in')) return false;
  return (
    raw.includes('failed to fetch') ||
    raw.includes('network') ||
    raw.includes('timeout') ||
    raw.includes('timed out') ||
    raw.includes('rate') ||
    raw.includes('429') ||
    raw.includes('500') ||
    raw.includes('502') ||
    raw.includes('503') ||
    raw.includes('504')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncNowWithRetry(options?: { attempts?: number; baseDelayMs?: number }): Promise<Awaited<ReturnType<typeof syncNow>>> {
  const attempts = Math.max(1, Number(options?.attempts ?? 3));
  const baseDelayMs = Math.max(50, Number(options?.baseDelayMs ?? 300));

  let last: Awaited<ReturnType<typeof syncNow>> | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await syncNow();
    if (last.ok) return last;
    if (last.mode === 'not_configured' || last.mode === 'signed_out') return last;
    if (!isRetryableSyncMessage(last.message)) return last;
    const delay = Math.min(2500, baseDelayMs * Math.pow(2, attempt));
    await sleep(delay);
  }
  return last ?? { ok: false, appliedRemote: 0, pushedLocal: 0, mode: 'not_configured', message: 'Unknown error' };
}
