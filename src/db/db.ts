import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import { upsertTombstone } from '@/lib/tombstones';
import { normalizeSkillName } from '@/lib/utils';

// --- Zod Schemas for Production Validation ---

export const JournalEntrySchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1),
  timestamp: z.union([
    z.number().finite(),
    z.string().transform((v) => new Date(v).getTime()).pipe(z.number().finite()),
  ]),
  type: z.enum(['journal', 'project']),
  lastModified: z
    .union([z.number().finite(), z.string().transform((v) => new Date(v).getTime()).pipe(z.number().finite())])
    .optional(),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const SkillSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  category: z.enum(['hard', 'soft', 'experience', 'interest', 'trait', 'strength', 'weakness']),
  sourceEntryIds: z.array(z.string().uuid()).default([]),
  createdAt: z.union([
    z.number().finite(),
    z.string().transform((v) => new Date(v).getTime()).pipe(z.number().finite()),
  ]),
  lastModified: z
    .union([z.number().finite(), z.string().transform((v) => new Date(v).getTime()).pipe(z.number().finite())])
    .optional(),
});

export type Skill = z.infer<typeof SkillSchema>;

export const SolutionSchema = z.object({
  id: z.string().uuid(),
  problem: z.string().min(1),
  solution: z.string().min(1),
  sourceEntryIds: z.array(z.string().uuid()).optional(),
  sourceSkillNames: z.array(z.string()).optional(),
  sourceArchetypes: z.array(z.string()).optional(),
  memuContext: z
    .object({
      engine: z.enum(['embedded', 'api']),
      personalHits: z.number().finite().nonnegative(),
      projectHits: z.number().finite().nonnegative(),
      failed: z.boolean().optional(),
    })
    .optional(),
  timestamp: z.union([
    z.number().finite(),
    z.string().transform((v) => new Date(v).getTime()).pipe(z.number().finite()),
  ]),
  lastModified: z
    .union([z.number().finite(), z.string().transform((v) => new Date(v).getTime()).pipe(z.number().finite())])
    .optional(),
});

export type Solution = z.infer<typeof SolutionSchema>;

export const InsightSchema = z.object({
  id: z.string().uuid(),
  entryId: z.string().uuid(),
  title: z.string().optional(),
  content: z.string().optional(),
  archetypes: z.array(z.string()).default([]),
  hiddenPatterns: z.array(z.string()).default([]),
  criticalQuestions: z.array(z.string()).default([]),
  evidenceQuotes: z.array(z.string()).optional(),
  timestamp: z.union([
    z.number().finite(),
    z.string().transform((v) => new Date(v).getTime()).pipe(z.number().finite()),
  ]),
  lastModified: z
    .union([z.number().finite(), z.string().transform((v) => new Date(v).getTime()).pipe(z.number().finite())])
    .optional(),
});

export type Insight = z.infer<typeof InsightSchema>;

export interface MyStatsDB extends DBSchema {
  journal: {
    key: string;
    value: JournalEntry;
    indexes: { 'by-date': number };
  };
  skills: {
    key: string;
    value: Skill;
    indexes: { 'by-category': string };
  };
  solutions: {
    key: string;
    value: Solution;
    indexes: { 'by-date': number };
  };
  insights: {
    key: string;
    value: Insight;
    indexes: { 'by-entry': string };
  };
}

export const DB_NAME = 'mystats-db';
export const DB_VERSION = 8;
const DB_OPEN_TIMEOUT_MS = 8000;
export const DB_OP_TIMEOUT_MS = 8000;

export const DB_ERRORS = {
    blocked: 'DB_BLOCKED',
    timeout: 'DB_TIMEOUT',
} as const;

const ensureStores = (db: IDBPDatabase<MyStatsDB>) => {
  if (!db.objectStoreNames.contains('journal')) {
    const entryStore = db.createObjectStore('journal', { keyPath: 'id' });
    entryStore.createIndex('by-date', 'timestamp');
  }
  if (!db.objectStoreNames.contains('skills')) {
    const skillStore = db.createObjectStore('skills', { keyPath: 'id' });
    skillStore.createIndex('by-category', 'category');
  }
  if (!db.objectStoreNames.contains('solutions')) {
    const solutionStore = db.createObjectStore('solutions', { keyPath: 'id' });
    solutionStore.createIndex('by-date', 'timestamp');
  }
  if (!db.objectStoreNames.contains('insights')) {
    const insightStore = db.createObjectStore('insights', { keyPath: 'id' });
    insightStore.createIndex('by-entry', 'entryId');
  }
};

/**
 * Ensures the storage is persistent and not cleared by the browser automatically.
 */
const requestPersistence = async () => {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persist();
    console.log(`[DB] Storage persistence: ${isPersisted ? 'granted' : 'denied'}`);
    return isPersisted;
  }
  return false;
};

const REQUIRED_STORES = ['journal', 'skills', 'solutions', 'insights'] as const;

const hasAllStores = (db: IDBPDatabase<MyStatsDB>) =>
  REQUIRED_STORES.every(name => db.objectStoreNames.contains(name));

function isVersionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return 'name' in error && (error as { name?: unknown }).name === 'VersionError';
}

export const initDB = async () => {
  await requestPersistence();
  let isBlocked = false;
  const openPromise = (async () => {
    try {
      return await openDB<MyStatsDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
          if (oldVersion < DB_VERSION) {
            ensureStores(db);
          }
        },
        blocked() {
          isBlocked = true;
          console.warn('[DB] Open blocked: close other MyStats tabs to finish upgrade.');
        },
        terminated() {
          console.warn('[DB] Connection terminated unexpectedly.');
        },
      });
    } catch (error) {
      // If the DB was auto-upgraded to a newer version (ex: missing store repair),
      // opening with a lower version throws a VersionError. Fall back to opening
      // the existing DB version.
      if (isVersionError(error)) {
        return await openDB<MyStatsDB>(DB_NAME);
      }
      throw error;
    }
  })();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(isBlocked ? DB_ERRORS.blocked : DB_ERRORS.timeout));
    }, DB_OPEN_TIMEOUT_MS);
  });

  try {
    const db = await Promise.race([openPromise, timeoutPromise]);
    if (!hasAllStores(db)) {
      console.warn('[DB] Missing stores detected. Forcing schema upgrade.');
      const nextVersion = db.version + 1;
      db.close();
      return await openDB<MyStatsDB>(DB_NAME, nextVersion, {
        upgrade(upgradeDb) {
          ensureStores(upgradeDb);
        },
      });
    }
    return db;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

/**
 * Mirror critical data to LocalStorage as a secondary failsafe.
 */
export const updateMirror = async () => {
    try {
        const db = await getDB();
        const insights = await db.getAll('insights');
        const skills = await db.getAll('skills');
        // We only mirror the last 10 insights and all skills (usually small)
        localStorage.setItem('MYSTATS_MIRROR_INSIGHTS', JSON.stringify(insights.slice(-10)));
        localStorage.setItem('MYSTATS_MIRROR_SKILLS', JSON.stringify(skills));
        localStorage.setItem('MYSTATS_MIRROR_TS', Date.now().toString());
        console.log("[DB] Heartbeat Mirror updated.");
    } catch (e) {
        console.warn("[DB] Mirror update failed", e);
    }
};

/**
 * Recover data from mirror if IndexedDB is empty.
 */
export const recoverFromMirror = async () => {
    const insightsStr = localStorage.getItem('MYSTATS_MIRROR_INSIGHTS');
    const skillsStr = localStorage.getItem('MYSTATS_MIRROR_SKILLS');
    
    if (insightsStr || skillsStr) {
        console.log("[DB] Attempting recovery from mirror...");
        try {
            const db = await getDB();
            const [existingInsights, existingSkills] = await Promise.all([
                db.count('insights'),
                db.count('skills'),
            ]);
            if (existingInsights > 0 || existingSkills > 0) {
                return false;
            }
            const insights = insightsStr ? JSON.parse(insightsStr) : [];
            const skills = skillsStr ? JSON.parse(skillsStr) : [];
            await importAllData({ insights, skills, journal: [], solutions: [] });
            console.log("[DB] Recovery from mirror successful.");
            return true;
        } catch (e) {
            console.error("[DB] Recovery from mirror failed", e);
        }
    }
    return false;
};

/**
 * Normalizes existing data to match the new high-integrity schema.
 * Moves data from 'entries' to 'journal' if needed and fixes timestamps.
 */
export const migrateData = async () => {
    const db = await getDB();
    // This migration touches legacy store names (ex: 'entries'), so we intentionally
    // loosen typings here to avoid blocking compilation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyDb = db as unknown as IDBPDatabase<any>;
    const storeNames = Array.from(legacyDb.objectStoreNames);
    
    // 1. Move data from 'entries' to 'journal' if 'entries' exists
    if (storeNames.includes('entries') && storeNames.includes('journal')) {
        try {
            const tx = legacyDb.transaction(['entries', 'journal'], 'readwrite');
            const oldStore = tx.objectStore('entries');
            const newStore = tx.objectStore('journal');
            
            const allData = await oldStore.getAll();
            if (allData.length > 0) {
                for (const item of allData) {
                    // Fix timestamp while moving
                    if (typeof item.timestamp === 'string') {
                        item.timestamp = new Date(item.timestamp).getTime();
                    }
                    await newStore.put(item);
                }
                console.log(`Successfully migrated ${allData.length} entries from 'entries' to 'journal'`);
            }
            await tx.done;
        } catch (err) {
            console.error("Migration from 'entries' to 'journal' failed:", err);
        }
    }

    // 2. Normalize journal, skills, and insights timestamps
    const activeStores = ['journal', 'skills', 'insights'].filter(s => storeNames.includes(s));
    if (activeStores.length > 0) {
        try {
            const tx2 = legacyDb.transaction(activeStores, 'readwrite');
            
            if (activeStores.includes('journal')) {
                const journalStore = tx2.objectStore('journal');
                const entries = await journalStore.getAll();
                for (const entry of entries) {
                    if (typeof entry.timestamp === 'string') {
                        entry.timestamp = new Date(entry.timestamp).getTime();
                        await journalStore.put(entry);
                    }
                }
            }
            
            // Add similar normalization for other stores if needed
            
            await tx2.done;
        } catch (err) {
            console.error("Data normalization failed:", err);
        }
    }
};

export const getDB = async () => {
    return await initDB();
};

/**
 * Exports all data from IndexedDB as a JSON object.
 */
export const exportAllData = async () => {
    const db = await getDB();
    const stores = ['journal', 'skills', 'solutions', 'insights'] as const;
    const exportData: Record<string, (JournalEntry | Skill | Solution | Insight)[]> = {};

    for (const storeName of stores) {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        exportData[storeName] = await store.getAll();
    }

    return exportData;
};

/**
 * Imports data from a JSON object into IndexedDB.
 * Performs validation before saving.
 */
export const importAllData = async (data: Record<string, unknown[]>) => {
    const db = await getDB();
    const stores = ['journal', 'skills', 'solutions', 'insights'] as const;

    // Validation Mapping
    const schemas = {
        journal: JournalEntrySchema,
        skills: SkillSchema,
        solutions: SolutionSchema,
        insights: InsightSchema
    };

    const tx = db.transaction(stores, 'readwrite');

    for (const storeName of stores) {
        if (!data[storeName] || !Array.isArray(data[storeName])) continue;
        
        const store = tx.objectStore(storeName);
        const schema = schemas[storeName];

        for (const item of data[storeName]) {
            try {
                const parsed = schema.parse(item);
                await store.put(parsed as JournalEntry | Skill | Solution | Insight);
            } catch (err) {
                console.error(`Validation failed for item in ${storeName}:`, err, item);
                // Continue with next item instead of failing entire import
            }
        }
    }

    await tx.done;
    await updateMirror();
};

/**
 * Upserts a skill into the database, managing the relationship with journal entries.
 */
export const upsertSkill = async (
    skillData: { name: string; category: Skill['category'] }, 
    entryId: string
) => {
    const db = await getDB();
    const tx = db.transaction('skills', 'readwrite');
    const store = tx.objectStore('skills');
    
    const normalizedName = normalizeSkillName(skillData.name).toLowerCase();
    let existingSkill: Skill | null = null;
    let cursor = await store.openCursor();
    while (cursor) {
        if (normalizeSkillName(cursor.value.name).toLowerCase() === normalizedName) {
            existingSkill = cursor.value;
            break;
        }
        cursor = await cursor.continue();
    }

    if (existingSkill) {
        if (!existingSkill.sourceEntryIds.includes(entryId)) {
            existingSkill.sourceEntryIds.push(entryId);
            existingSkill.lastModified = Date.now();
            await store.put(existingSkill);
        }
    } else {
        const newSkill: Skill = {
            id: crypto.randomUUID(),
            name: normalizeSkillName(skillData.name),
            category: skillData.category,
            sourceEntryIds: [entryId],
            createdAt: Date.now(),
            lastModified: Date.now()
        };
        // Validate before insert
        SkillSchema.parse(newSkill);
        await store.put(newSkill);
    }
    await tx.done;
    await updateMirror();
};

export const updateJournalEntry = async (
  db: IDBPDatabase<MyStatsDB>,
  entryId: string,
  content: string,
  lastModified: number = Date.now()
): Promise<JournalEntry | null> => {
  const cleanId = (entryId || '').trim();
  if (!cleanId) return null;

  const tx = db.transaction('journal', 'readwrite');
  const store = tx.objectStore('journal');
  const existing = await store.get(cleanId);
  if (!existing) {
    await tx.done;
    return null;
  }
  const updated: JournalEntry = {
    ...existing,
    content,
    lastModified,
  };
  JournalEntrySchema.parse(updated);
  await store.put(updated);
  await tx.done;
  return updated;
};

export const upsertInsightByEntryId = async (
  db: IDBPDatabase<MyStatsDB>,
  entryId: string,
  patch: Partial<
    Pick<Insight, 'title' | 'content' | 'archetypes' | 'hiddenPatterns' | 'criticalQuestions' | 'evidenceQuotes'>
  >,
  entryTimestamp: number,
  lastModified: number = Date.now()
): Promise<Insight> => {
  const cleanEntryId = (entryId || '').trim();
  if (!cleanEntryId) {
    throw new Error('entryId required');
  }
  const tx = db.transaction('insights', 'readwrite');
  const store = tx.objectStore('insights');

  const existing = await store.index('by-entry').getAll(cleanEntryId);
  const keep = existing
    .slice()
    .sort((a, b) => (b.lastModified ?? b.timestamp ?? 0) - (a.lastModified ?? a.timestamp ?? 0))[0];

  const keepId = keep?.id ?? crypto.randomUUID();
  for (const item of existing) {
    if (item.id !== keepId) {
      await store.delete(item.id);
    }
  }

  const next: Insight = {
    id: keepId,
    entryId: cleanEntryId,
    title: patch.title ?? keep?.title,
    content: patch.content ?? keep?.content,
    archetypes: patch.archetypes ?? keep?.archetypes ?? [],
    hiddenPatterns: patch.hiddenPatterns ?? keep?.hiddenPatterns ?? [],
    criticalQuestions: patch.criticalQuestions ?? keep?.criticalQuestions ?? [],
    evidenceQuotes: patch.evidenceQuotes ?? keep?.evidenceQuotes ?? [],
    timestamp: entryTimestamp,
    lastModified,
  };
  InsightSchema.parse(next);
  await store.put(next);
  await tx.done;
  return next;
};

export const deleteJournalEntryCascade = async (
  db: IDBPDatabase<MyStatsDB>,
  entryId: string,
  tombstoneTs: number = Date.now()
): Promise<{
  deleted: boolean;
  deletedInsightIds: string[];
  deletedSkillIds: string[];
}> => {
  const cleanEntryId = (entryId || '').trim();
  const ts = Number.isFinite(Number(tombstoneTs)) && Number(tombstoneTs) > 0 ? Number(tombstoneTs) : Date.now();

  const tx = db.transaction(['journal', 'insights', 'skills'], 'readwrite');
  const journalStore = tx.objectStore('journal');
  const insightStore = tx.objectStore('insights');
  const skillStore = tx.objectStore('skills');

  const existingEntry = cleanEntryId ? await journalStore.get(cleanEntryId) : null;
  if (existingEntry) {
    await journalStore.delete(cleanEntryId);
  }

  const insights = cleanEntryId ? await insightStore.index('by-entry').getAll(cleanEntryId) : [];
  const deletedInsightIds = insights.map((item) => item.id);
  for (const insight of insights) {
    await insightStore.delete(insight.id);
  }

  const skills = await skillStore.getAll();
  const deletedSkillIds: string[] = [];
  for (const skill of skills) {
    if (!Array.isArray(skill.sourceEntryIds) || !skill.sourceEntryIds.includes(cleanEntryId)) continue;
    const remaining = skill.sourceEntryIds.filter((id) => id !== cleanEntryId);
    if (remaining.length === 0) {
      await skillStore.delete(skill.id);
      deletedSkillIds.push(skill.id);
      continue;
    }
    const updated: Skill = { ...skill, sourceEntryIds: remaining, lastModified: ts };
    SkillSchema.parse(updated);
    await skillStore.put(updated);
  }

  await tx.done;

  // Tombstones are stored outside IndexedDB so deletes can sync and not resurrect.
  if (cleanEntryId) {
    upsertTombstone('journal', cleanEntryId, ts);
  }
  for (const id of deletedInsightIds) {
    upsertTombstone('insights', id, ts);
  }
  for (const id of deletedSkillIds) {
    upsertTombstone('skills', id, ts);
  }

  await updateMirror();
  return { deleted: Boolean(existingEntry), deletedInsightIds, deletedSkillIds };
};
