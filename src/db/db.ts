import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';

// --- Zod Schemas for Production Validation ---

export const JournalEntrySchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1),
  timestamp: z.union([z.number(), z.string().transform(v => new Date(v).getTime())]),
  type: z.enum(['journal', 'project']),
  lastModified: z.number().optional()
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const SkillSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  category: z.enum(['hard', 'soft', 'experience', 'interest', 'trait', 'strength', 'weakness']),
  sourceEntryIds: z.array(z.string().uuid()).default([]),
  createdAt: z.number(),
  lastModified: z.number().optional()
});

export type Skill = z.infer<typeof SkillSchema>;

export const SolutionSchema = z.object({
  id: z.string().uuid(),
  problem: z.string().min(1),
  solution: z.string().min(1),
  timestamp: z.number(),
  lastModified: z.number().optional()
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
  timestamp: z.number(),
  lastModified: z.number().optional()
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
const DB_VERSION = 8;
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

export const initDB = async () => {
  await requestPersistence();
  let isBlocked = false;
  const openPromise = openDB<MyStatsDB>(DB_NAME, DB_VERSION, {
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

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(isBlocked ? DB_ERRORS.blocked : DB_ERRORS.timeout));
    }, DB_OPEN_TIMEOUT_MS);
  });

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
};

/**
 * Mirror critical data to LocalStorage as a secondary failsafe.
 */
export const updateMirror = async () => {
    try {
        const db = await openDB(DB_NAME, DB_VERSION);
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
    const db = await openDB(DB_NAME, DB_VERSION);
    const storeNames = Array.from(db.objectStoreNames);
    
    // 1. Move data from 'entries' to 'journal' if 'entries' exists
    if (storeNames.includes('entries') && storeNames.includes('journal')) {
        try {
            const tx = db.transaction(['entries', 'journal'], 'readwrite');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oldStore = tx.objectStore('entries' as any);
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tx2 = db.transaction(activeStores as any, 'readwrite');
            
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exportData: Record<string, any[]> = {};

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const importAllData = async (data: Record<string, any[]>) => {
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
                // Fix timestamps for journal if they came in as strings in the backup
                if (storeName === 'journal' && typeof (item as Record<string, unknown>).timestamp === 'string') {
                    (item as Record<string, unknown>).timestamp = new Date((item as Record<string, unknown>).timestamp as string).getTime();
                }
                
                // Validate
                schema.parse(item);
                await store.put(item as JournalEntry | Skill | Solution | Insight);
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
    
    const allSkills = await store.getAll();
    const existingSkill = allSkills.find(s => s.name.toLowerCase() === skillData.name.toLowerCase());

    if (existingSkill) {
        if (!existingSkill.sourceEntryIds.includes(entryId)) {
            existingSkill.sourceEntryIds.push(entryId);
            existingSkill.lastModified = Date.now();
            await store.put(existingSkill);
        }
    } else {
        const newSkill: Skill = {
            id: crypto.randomUUID(),
            name: skillData.name,
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
