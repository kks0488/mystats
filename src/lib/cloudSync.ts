import type { IDBPDatabase } from 'idb';
import {
  getDB,
  deleteJournalEntryCascade,
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
  deleteFallbackJournalEntryCascade,
  replaceFallbackInsights,
  replaceFallbackJournalEntries,
  replaceFallbackSkills,
} from '@/db/fallback';
import { listTombstones, pruneTombstones, upsertTombstone, type TombstoneKind } from '@/lib/tombstones';
import { getSupabaseClient } from '@/lib/supabase';

export type CloudSyncKind = TombstoneKind;

export interface CloudSyncConfig {
  enabled: boolean;
  autoSync: boolean;
}

const CLOUD_SYNC_STORAGE_KEY = 'MYSTATS_CLOUD_SYNC_CONFIG_V1';
const CLOUD_SYNC_LAST_SYNC_KEY = 'MYSTATS_CLOUD_SYNC_LAST_SYNC_V1';
const CLOUD_SYNC_LAST_RESULT_KEY = 'MYSTATS_CLOUD_SYNC_LAST_RESULT_V1';
const CLOUD_SYNC_COOLDOWN_UNTIL_KEY = 'MYSTATS_CLOUD_SYNC_COOLDOWN_UNTIL_V1';
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 300;
const DEFAULT_NETWORK_COOLDOWN_MS = 30_000;

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

export type CloudSyncFailureCode = 'network' | 'auth' | 'conflict' | 'unknown';
export type CloudSyncStatusPhase = 'start' | 'retry' | 'success' | 'fail' | 'cooldown';

export type CloudSyncStatusEventDetail = {
  phase: CloudSyncStatusPhase;
  ok: boolean;
  message?: string;
  retryCount: number;
  at: number;
  cooldownUntil?: number;
};

const CLOUD_FAILURE_CODES: ReadonlySet<CloudSyncFailureCode> = new Set(['network', 'auth', 'conflict', 'unknown']);

export type CloudSyncResult = {
  ok: boolean;
  appliedRemote: number;
  pushedLocal: number;
  mode: LocalSnapshot['mode'] | 'signed_out' | 'not_configured';
  message?: string;
  retryCount: number;
  cooldownUntil?: number;
  failureCode?: CloudSyncFailureCode;
  skippedRemoteBecauseTombstone?: number;
  skippedRemoteBecauseLocalNewer?: number;
};

export type CloudSyncLastResult = CloudSyncResult & { at: number };

export function getCloudLastSyncResult(): CloudSyncLastResult | null {
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_LAST_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CloudSyncLastResult>;
    const at = typeof parsed.at === 'number' ? parsed.at : Number(parsed.at);
    if (!Number.isFinite(at) || at <= 0) return null;
    const appliedRemote = typeof parsed.appliedRemote === 'number' ? parsed.appliedRemote : Number(parsed.appliedRemote);
    const pushedLocal = typeof parsed.pushedLocal === 'number' ? parsed.pushedLocal : Number(parsed.pushedLocal);
    const retryCount = typeof parsed.retryCount === 'number' ? parsed.retryCount : Number(parsed.retryCount);
    const cooldownUntil =
      typeof parsed.cooldownUntil === 'number'
        ? parsed.cooldownUntil
        : parsed.cooldownUntil !== undefined
          ? Number(parsed.cooldownUntil)
          : undefined;
    const failureCode = normalizeCloudFailureCode(parsed.failureCode);
    const skippedRemoteBecauseTombstone =
      typeof parsed.skippedRemoteBecauseTombstone === 'number'
        ? parsed.skippedRemoteBecauseTombstone
        : parsed.skippedRemoteBecauseTombstone !== undefined
          ? Number(parsed.skippedRemoteBecauseTombstone)
          : undefined;
    const skippedRemoteBecauseLocalNewer =
      typeof parsed.skippedRemoteBecauseLocalNewer === 'number'
        ? parsed.skippedRemoteBecauseLocalNewer
        : parsed.skippedRemoteBecauseLocalNewer !== undefined
          ? Number(parsed.skippedRemoteBecauseLocalNewer)
          : undefined;
    const mode = typeof parsed.mode === 'string' ? parsed.mode : null;
    if (!mode) return null;
    return {
      at,
      ok: Boolean(parsed.ok),
      appliedRemote: Number.isFinite(appliedRemote) ? appliedRemote : 0,
      pushedLocal: Number.isFinite(pushedLocal) ? pushedLocal : 0,
      retryCount: Number.isFinite(retryCount) ? Math.max(0, retryCount) : 0,
      cooldownUntil: cooldownUntil !== undefined && Number.isFinite(cooldownUntil) && cooldownUntil > 0 ? cooldownUntil : undefined,
      failureCode,
      mode: mode as CloudSyncLastResult['mode'],
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
      skippedRemoteBecauseTombstone:
        skippedRemoteBecauseTombstone !== undefined && Number.isFinite(skippedRemoteBecauseTombstone)
          ? skippedRemoteBecauseTombstone
          : undefined,
      skippedRemoteBecauseLocalNewer:
        skippedRemoteBecauseLocalNewer !== undefined && Number.isFinite(skippedRemoteBecauseLocalNewer)
          ? skippedRemoteBecauseLocalNewer
          : undefined,
    };
  } catch {
    return null;
  }
}

function setCloudLastSyncResult(result: CloudSyncLastResult): void {
  try {
    localStorage.setItem(CLOUD_SYNC_LAST_RESULT_KEY, JSON.stringify(result));
  } catch {
    // ignore
  }
}

function normalizeCloudFailureCode(value: unknown): CloudSyncFailureCode | undefined {
  if (typeof value !== 'string') return undefined;
  return CLOUD_FAILURE_CODES.has(value as CloudSyncFailureCode) ? (value as CloudSyncFailureCode) : undefined;
}

function emitCloudSyncStatus(detail: CloudSyncStatusEventDetail): void {
  window.dispatchEvent(new CustomEvent<CloudSyncStatusEventDetail>('mystats-cloud-sync-status', { detail }));
}

function inferCloudFailureCode(result: Pick<CloudSyncResult, 'mode' | 'message'>): CloudSyncFailureCode {
  if (result.mode === 'signed_out') return 'auth';

  const raw = (result.message || '').trim().toLowerCase();
  if (!raw) return 'unknown';
  if (
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
  ) {
    return 'network';
  }
  if (
    raw.includes('not signed in') ||
    raw.includes('jwt') ||
    raw.includes('token') ||
    raw.includes('unauthorized') ||
    raw.includes('invalid login')
  ) {
    return 'auth';
  }
  if (
    raw.includes('row level security') ||
    raw.includes('row-level security') ||
    raw.includes('violates row-level security') ||
    raw.includes('conflict')
  ) {
    return 'conflict';
  }
  return 'unknown';
}

function withCloudResultDefaults(result: Omit<CloudSyncResult, 'retryCount'> & { retryCount?: number }): CloudSyncResult {
  const retryCount = Number.isFinite(result.retryCount) ? Math.max(0, Number(result.retryCount)) : 0;
  const failureCode = result.ok ? undefined : result.failureCode ?? inferCloudFailureCode(result);
  const cooldownUntil =
    typeof result.cooldownUntil === 'number' && Number.isFinite(result.cooldownUntil) && result.cooldownUntil > 0
      ? result.cooldownUntil
      : undefined;

  return {
    ...result,
    retryCount,
    failureCode,
    cooldownUntil,
  };
}

function storeCloudSyncResult(result: Omit<CloudSyncResult, 'retryCount'> & { retryCount?: number }): CloudSyncResult {
  const normalized = withCloudResultDefaults(result);
  setCloudLastSyncResult({
    at: Date.now(),
    ...normalized,
  });
  return normalized;
}

export function getCloudSyncCooldownUntil(): number | null {
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_COOLDOWN_UNTIL_KEY);
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}

function setCloudSyncCooldownUntil(ts: number | null): void {
  try {
    if (typeof ts === 'number' && Number.isFinite(ts) && ts > Date.now()) {
      localStorage.setItem(CLOUD_SYNC_COOLDOWN_UNTIL_KEY, String(ts));
      return;
    }
    localStorage.removeItem(CLOUD_SYNC_COOLDOWN_UNTIL_KEY);
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

function readLocalTombstoneMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of listTombstones()) {
    map.set(item.key, item.lastModified);
  }
  return map;
}

function getTombstoneLastModified(tombstones: Map<string, number>, kind: CloudSyncKind, id: string): number {
  return tombstones.get(`${kind}:${id}`) ?? 0;
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

type RemoteDeletion = { kind: CloudSyncKind; id: string; last_modified: number };

async function applyRemoteDeletesToDb(db: IDBPDatabase<MyStatsDB>, deletions: RemoteDeletion[]): Promise<void> {
  if (!deletions.length) return;
  let needsMirrorUpdate = false;

  for (const deletion of deletions) {
    const kind = deletion.kind;
    const id = deletion.id;
    const ts = deletion.last_modified;
    if (!id) continue;

    if (kind === 'journal') {
      await deleteJournalEntryCascade(db, id, ts);
      continue;
    }

    if (kind === 'skills') {
      const tx = db.transaction('skills', 'readwrite');
      await tx.objectStore('skills').delete(id);
      await tx.done;
      upsertTombstone('skills', id, ts);
      needsMirrorUpdate = true;
      continue;
    }

    if (kind === 'insights') {
      const tx = db.transaction('insights', 'readwrite');
      await tx.objectStore('insights').delete(id);
      await tx.done;
      upsertTombstone('insights', id, ts);
      needsMirrorUpdate = true;
      continue;
    }

    if (kind === 'solutions') {
      const tx = db.transaction('solutions', 'readwrite');
      await tx.objectStore('solutions').delete(id);
      await tx.done;
      upsertTombstone('solutions', id, ts);
    }
  }

  if (needsMirrorUpdate) {
    await updateMirror();
  }
}

function applyRemoteDeletesToFallback(deletions: RemoteDeletion[]): void {
  if (!deletions.length) return;
  for (const deletion of deletions) {
    const kind = deletion.kind;
    const id = deletion.id;
    const ts = deletion.last_modified;
    if (!id) continue;

    if (kind === 'journal') {
      deleteFallbackJournalEntryCascade(id, ts);
      continue;
    }

    if (kind === 'solutions') {
      continue;
    }

    upsertTombstone(kind, id, ts);

    if (kind === 'skills') {
      replaceFallbackSkills(loadFallbackSkills().filter((item) => item.id !== id));
      continue;
    }

    if (kind === 'insights') {
      replaceFallbackInsights(loadFallbackInsights().filter((item) => item.id !== id));
      continue;
    }
  }
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

export async function syncNow(): Promise<CloudSyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return storeCloudSyncResult({
      ok: false,
      appliedRemote: 0,
      pushedLocal: 0,
      mode: 'not_configured',
      message: 'Supabase not configured',
    });
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return storeCloudSyncResult({
      ok: false,
      appliedRemote: 0,
      pushedLocal: 0,
      mode: 'signed_out',
      message: sessionError.message,
    });
  }

  const user = sessionData.session?.user;
  if (!user) {
    return storeCloudSyncResult({
      ok: false,
      appliedRemote: 0,
      pushedLocal: 0,
      mode: 'signed_out',
      message: 'Not signed in',
    });
  }

  const local = await readLocalSnapshot();
  const localTombstonesBefore = readLocalTombstoneMap();

  const { data: remoteRows, error: remoteError } = await supabase
    .from('mystats_items')
    .select('kind,id,payload,last_modified,deleted')
    .eq('user_id', user.id);

  if (remoteError) {
    return storeCloudSyncResult({
      ok: false,
      appliedRemote: 0,
      pushedLocal: 0,
      mode: local.mode,
      message: remoteError.message,
    });
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
  let skippedRemoteBecauseTombstone = 0;
  let skippedRemoteBecauseLocalNewer = 0;
  const deletions: RemoteDeletion[] = [];
  for (const item of remoteMap.values()) {
    const localExisting = localByKind[item.kind].get(item.id);
    const localLm = localExisting ? getItemLastModified(item.kind, localExisting) : 0;
    const tombstoneLm = getTombstoneLastModified(localTombstonesBefore, item.kind, item.id);
    const localMax = Math.max(localLm, tombstoneLm);

    if (item.deleted) {
      if (item.kind === 'solutions' && local.mode !== 'db') {
        continue;
      }
      if (item.last_modified > localMax) {
        deletions.push({ kind: item.kind, id: item.id, last_modified: item.last_modified });
        appliedRemote += 1;
      }
      continue;
    }

    // Only apply remote upserts when they are newer than BOTH the local item and any local tombstone.
    // If the item doesn't exist locally, still respect tombstones to avoid resurrecting deletes.
    const shouldApply = (tombstoneLm === 0 && !localExisting) || item.last_modified > localMax;
    if (!shouldApply) {
      if (tombstoneLm > 0 && item.last_modified <= tombstoneLm) {
        skippedRemoteBecauseTombstone += 1;
      } else if (localExisting && item.last_modified <= localLm) {
        skippedRemoteBecauseLocalNewer += 1;
      }
    }
    if (shouldApply) {
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
        if (local.mode !== 'db') continue;
        const parsed = SolutionSchema.safeParse(payload);
        if (!parsed.success) continue;
        apply.solutions.push(parsed.data);
        appliedRemote += 1;
      }
    }
  }

  const hasUpserts = apply.journal.length > 0 || apply.skills.length > 0 || apply.insights.length > 0 || apply.solutions.length > 0;
  const hasDeletes = deletions.length > 0;

  if (hasUpserts || hasDeletes) {
    if (local.mode === 'db') {
      const db = await getDB();
      if (hasUpserts) {
        await applyRemoteToDb(db, apply);
      }
      if (hasDeletes) {
        await applyRemoteDeletesToDb(db, deletions);
      }
    } else {
      if (hasUpserts) {
        applyRemoteToFallback(local, { journal: apply.journal, skills: apply.skills, insights: apply.insights });
      }
      if (hasDeletes) {
        applyRemoteDeletesToFallback(deletions);
      }
    }
    window.dispatchEvent(new Event('mystats-data-updated'));
  }

  // Push local changes that are newer than remote.
  const localTombstonesAfter = readLocalTombstoneMap();
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
      const tombstoneLm = getTombstoneLastModified(localTombstonesAfter, kind, id);
      if (tombstoneLm > 0 && tombstoneLm >= localLm) continue;
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

  // Push tombstones so deletes won't resurrect on other devices.
  for (const tombstone of listTombstones()) {
    if (tombstone.kind === 'solutions' && local.mode !== 'db') continue;
    const remoteLm = remoteMap.get(tombstone.key)?.last_modified ?? 0;
    if (tombstone.lastModified <= remoteLm) continue;
    const localItem = localByKind[tombstone.kind]?.get(tombstone.id);
    const localLm = localItem ? getItemLastModified(tombstone.kind, localItem) : 0;
    if (localLm > tombstone.lastModified) continue; // Local item is newer (undelete).
    upserts.push({
      user_id: user.id,
      kind: tombstone.kind,
      id: tombstone.id,
      payload: {},
      last_modified: tombstone.lastModified,
      deleted: true,
    });
  }

  let pushedLocal = 0;
  if (upserts.length > 0) {
    const { error: upsertError } = await supabase.from('mystats_items').upsert(upserts, {
      onConflict: 'user_id,kind,id',
    });
    if (upsertError) {
      return storeCloudSyncResult({
        ok: false,
        appliedRemote,
        pushedLocal: 0,
        mode: local.mode,
        message: upsertError.message,
        skippedRemoteBecauseTombstone,
        skippedRemoteBecauseLocalNewer,
      });
    }
    pushedLocal = upserts.length;
  }

  setCloudLastSyncedAt(Date.now());
  setCloudSyncCooldownUntil(null);
  pruneTombstones();
  return storeCloudSyncResult({
    ok: true,
    appliedRemote,
    pushedLocal,
    mode: local.mode,
    skippedRemoteBecauseTombstone,
    skippedRemoteBecauseLocalNewer,
  });
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

export async function syncNowWithRetry(options?: {
  attempts?: number;
  baseDelayMs?: number;
  cooldownMs?: number;
}): Promise<CloudSyncResult> {
  const attempts = Math.max(1, Number(options?.attempts ?? DEFAULT_RETRY_ATTEMPTS));
  const baseDelayMs = Math.max(50, Number(options?.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS));
  const cooldownMs = Math.max(5_000, Number(options?.cooldownMs ?? DEFAULT_NETWORK_COOLDOWN_MS));

  const activeCooldown = getCloudSyncCooldownUntil();
  if (activeCooldown && activeCooldown > Date.now()) {
    const lastMode = getCloudLastSyncResult()?.mode ?? 'not_configured';
    const result = storeCloudSyncResult({
      ok: false,
      appliedRemote: 0,
      pushedLocal: 0,
      mode: lastMode,
      message: 'Network cooldown active',
      retryCount: 0,
      cooldownUntil: activeCooldown,
      failureCode: 'network',
    });
    emitCloudSyncStatus({
      phase: 'cooldown',
      ok: false,
      message: result.message,
      retryCount: result.retryCount,
      at: Date.now(),
      cooldownUntil: activeCooldown,
    });
    return result;
  }

  emitCloudSyncStatus({
    phase: 'start',
    ok: false,
    message: 'Sync started',
    retryCount: 0,
    at: Date.now(),
  });

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const attemptResult = await syncNow();
    const current = storeCloudSyncResult({ ...attemptResult, retryCount: attempt });

    if (current.ok) {
      setCloudSyncCooldownUntil(null);
      emitCloudSyncStatus({
        phase: 'success',
        ok: true,
        message: current.message,
        retryCount: current.retryCount,
        at: Date.now(),
      });
      return current;
    }

    const retryable =
      current.mode !== 'not_configured' &&
      current.mode !== 'signed_out' &&
      current.failureCode === 'network' &&
      isRetryableSyncMessage(current.message);

    if (!retryable) {
      if (current.failureCode !== 'network') {
        setCloudSyncCooldownUntil(null);
      }
      emitCloudSyncStatus({
        phase: 'fail',
        ok: false,
        message: current.message,
        retryCount: current.retryCount,
        at: Date.now(),
      });
      return current;
    }

    if (attempt < attempts - 1) {
      const nextAttempt = attempt + 1;
      emitCloudSyncStatus({
        phase: 'retry',
        ok: false,
        message: current.message,
        retryCount: nextAttempt,
        at: Date.now(),
      });
      const delay = Math.min(2_500, baseDelayMs * Math.pow(2, attempt));
      await sleep(delay);
      continue;
    }

    const cooldownUntil = Date.now() + cooldownMs;
    setCloudSyncCooldownUntil(cooldownUntil);
    const exhausted = storeCloudSyncResult({
      ...current,
      retryCount: attempt,
      cooldownUntil,
      failureCode: 'network',
    });
    emitCloudSyncStatus({
      phase: 'cooldown',
      ok: false,
      message: exhausted.message,
      retryCount: exhausted.retryCount,
      at: Date.now(),
      cooldownUntil,
    });
    return exhausted;
  }

  const fallback = storeCloudSyncResult({
    ok: false,
    appliedRemote: 0,
    pushedLocal: 0,
    mode: 'not_configured',
    message: 'Unknown error',
    retryCount: 0,
    failureCode: 'unknown',
  });
  emitCloudSyncStatus({
    phase: 'fail',
    ok: false,
    message: fallback.message,
    retryCount: fallback.retryCount,
    at: Date.now(),
  });
  return fallback;
}
