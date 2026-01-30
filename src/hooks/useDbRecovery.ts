import { useCallback, useRef } from 'react';
import type { IDBPDatabase } from 'idb';
import type { MyStatsDB } from '../db/db';
import {
  loadFallbackJournalEntries,
  loadFallbackSkills,
  loadFallbackInsights,
  clearFallbackData,
} from '../db/fallback';
import { useLanguage } from './useLanguage';

/**
 * Shared hook for recovering fallback data (LocalStorage/memory) back into IndexedDB.
 * Used by Journal and Profile pages to migrate data after a DB outage recovery.
 */
export function useDbRecovery(
  setDbNotice: (msg: string | null) => void,
  onFallbackActive?: () => void,
) {
  const { t } = useLanguage();
  const migrationInProgress = useRef(false);

  const maybeRecoverFallbackData = useCallback(
    async (db: IDBPDatabase<MyStatsDB>) => {
      if (migrationInProgress.current) return false;
      const fallbackEntries = loadFallbackJournalEntries();
      const fallbackSkills = loadFallbackSkills();
      const fallbackInsights = loadFallbackInsights();
      if (!fallbackEntries.length && !fallbackSkills.length && !fallbackInsights.length)
        return false;
      migrationInProgress.current = true;
      setDbNotice(t('dbRecovering'));
      try {
        const tx = db.transaction(['journal', 'skills', 'insights'], 'readwrite');
        const journalStore = tx.objectStore('journal');
        const skillStore = tx.objectStore('skills');
        const insightStore = tx.objectStore('insights');

        for (const entry of fallbackEntries) {
          await journalStore.put(entry);
        }
        for (const skill of fallbackSkills) {
          await skillStore.put(skill);
        }
        for (const insight of fallbackInsights) {
          await insightStore.put(insight);
        }

        await tx.done;
        clearFallbackData();
        setDbNotice(t('dbRecovered'));
        setTimeout(() => setDbNotice(null), 4000);
        return true;
      } catch (error) {
        console.warn('Failed to recover fallback data', error);
        onFallbackActive?.();
        return false;
      } finally {
        migrationInProgress.current = false;
      }
    },
    [t, setDbNotice, onFallbackActive],
  );

  return { maybeRecoverFallbackData, migrationInProgress };
}
