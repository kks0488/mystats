import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { AlertTriangle, Database, Download, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';
import { normalizeSkillName } from '@/lib/utils';
import { DB_NAME, DB_VERSION, exportAllData, importAllData, updateMirror, type Insight, type JournalEntry, type Skill } from '@/db/db';
import { hasAnyFallbackCollections, mergeById, parseBackupPayload } from '@/lib/backup';
import {
  loadFallbackInsights,
  loadFallbackJournalEntries,
  loadFallbackSkills,
  replaceFallbackInsights,
  replaceFallbackJournalEntries,
  replaceFallbackSkills,
} from '@/db/fallback';

const mergeSkillsByName = (items: Skill[]): Skill[] => {
  const map = new Map<string, { skill: Skill; sourceIds: Set<string> }>();
  for (const item of items) {
    if (!item || typeof item.name !== 'string') continue;
    const key = normalizeSkillName(item.name);
    if (!key) continue;
    const sourceIds = new Set(item.sourceEntryIds ?? []);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { skill: item, sourceIds });
      continue;
    }
    for (const id of sourceIds) {
      existing.sourceIds.add(id);
    }
    const existingTime = existing.skill.lastModified ?? existing.skill.createdAt ?? 0;
    const nextTime = item.lastModified ?? item.createdAt ?? 0;
    if (nextTime >= existingTime) {
      existing.skill = item;
    }
  }
  return Array.from(map.values()).map((value) => ({
    ...value.skill,
    sourceEntryIds: Array.from(value.sourceIds),
  }));
};

function readMirrorTimestamp(): number | null {
  try {
    const raw = localStorage.getItem('MYSTATS_MIRROR_TS');
    const ts = raw ? Number(raw) : NaN;
    return Number.isFinite(ts) && ts > 0 ? ts : null;
  } catch {
    return null;
  }
}

export function DataManagementCard({ onRefreshStorageMode }: { onRefreshStorageMode: () => Promise<void> }) {
  const { t, language } = useLanguage();
  const [isExporting, setIsExporting] = useState(false);
  const [isResettingDb, setIsResettingDb] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [mirrorLastUpdatedAt, setMirrorLastUpdatedAt] = useState<number | null>(null);
  const [mirrorMessage, setMirrorMessage] = useState<string | null>(null);
  const [isRebuildingMirror, setIsRebuildingMirror] = useState(false);

  useEffect(() => {
    setMirrorLastUpdatedAt(readMirrorTimestamp());
  }, []);

  const handleExport = useCallback(async () => {
    try {
      setIsExporting(true);
      let data: Record<string, unknown[]> = { journal: [], skills: [], solutions: [], insights: [] };
      let dbAvailable = true;
      try {
        data = await exportAllData();
      } catch (err) {
        console.warn('Export failed from DB, falling back', err);
        dbAvailable = false;
        void import('@/lib/sentry').then(({ captureException }) =>
          captureException(err, { phase: 'backup_export', dbAvailable })
        );
      }
      const fallback = {
        journal: loadFallbackJournalEntries(),
        skills: loadFallbackSkills(),
        insights: loadFallbackInsights(),
      };
      const hasFallback = hasAnyFallbackCollections(fallback);
      let includeFallback = hasFallback;

      if (!dbAvailable) {
        const confirmExport = window.confirm(t('exportDbUnavailable'));
        if (!confirmExport) {
          setIsExporting(false);
          return;
        }
      } else if (hasFallback) {
        const confirmExport = window.confirm(t('exportFallbackWarning'));
        if (!confirmExport) {
          includeFallback = false;
        }
      }

      const payload = {
        meta: {
          version: 2,
          exportedAt: new Date().toISOString(),
          appVersion: __APP_VERSION__,
          dbVersion: DB_VERSION,
          sources: {
            indexeddb: dbAvailable,
            fallback: includeFallback && hasFallback,
          },
        },
        ...data,
        fallback: includeFallback ? fallback : { journal: [], skills: [], insights: [] },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mystats_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      void onRefreshStorageMode();
    } catch (err) {
      console.error('Export failed:', err);
      void import('@/lib/sentry').then(({ captureException }) =>
        captureException(err, { phase: 'backup_export' })
      );
      alert('Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [onRefreshStorageMode, t]);

  const handleImport = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Allow importing the same file multiple times by resetting the input value.
      e.target.value = '';

      const confirmImport = window.confirm(`${t('importConfirm')}\n\n${t('importMergeNote')}`);
      if (!confirmImport) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const raw = JSON.parse(event.target?.result as string) as unknown;
          const parsed = parseBackupPayload(raw);
          const baseData = parsed.base;
          const fallbackData = parsed.fallback;
          const hasFallback = hasAnyFallbackCollections(fallbackData);

          let includeFallback = hasFallback;
          if (hasFallback) {
            includeFallback = window.confirm(t('importFallbackWarning'));
          }

          const selectedJournal = (includeFallback
            ? [...baseData.journal, ...fallbackData.journal]
            : [...baseData.journal]) as JournalEntry[];
          const selectedSkills = (includeFallback ? [...baseData.skills, ...fallbackData.skills] : [...baseData.skills]) as Skill[];
          const selectedInsights = (includeFallback
            ? [...baseData.insights, ...fallbackData.insights]
            : [...baseData.insights]) as Insight[];

          const rawJournal = selectedJournal;
          const rawSkills = selectedSkills;
          const rawInsights = selectedInsights;

          const mergedJournal = mergeById<JournalEntry>(selectedJournal);
          const mergedSkills = mergeSkillsByName(selectedSkills);
          const mergedInsights = mergeById<Insight>(selectedInsights);
          const mergedSolutions = mergeById(baseData.solutions as { id?: string }[]);

          const summaryText = t('importSummary')
            .replace('{entries}', String(mergedJournal.length))
            .replace('{skills}', String(mergedSkills.length))
            .replace('{insights}', String(mergedInsights.length))
            .replace('{solutions}', String(mergedSolutions.length));

          try {
            await importAllData({
              journal: mergedJournal,
              skills: mergedSkills,
              solutions: mergedSolutions,
              insights: mergedInsights,
            });
            alert(
              mergedJournal.length || mergedSkills.length || mergedInsights.length || mergedSolutions.length
                ? summaryText
                : t('importEmpty')
            );
            void onRefreshStorageMode();
            window.dispatchEvent(new Event('mystats-data-updated'));
          } catch (err) {
            console.warn('DB import failed. Saving to fallback only.', err);
            void import('@/lib/sentry').then(({ captureException }) =>
              captureException(err, { phase: 'backup_import', mode: 'fallback_only' })
            );
            replaceFallbackJournalEntries(rawJournal);
            replaceFallbackSkills(rawSkills);
            replaceFallbackInsights(rawInsights);
            alert(
              mergedJournal.length || mergedSkills.length || mergedInsights.length || mergedSolutions.length
                ? `${t('importFallbackOnly')}\n${summaryText}`
                : `${t('importFallbackOnly')}\n${t('importEmpty')}`
            );
            void onRefreshStorageMode();
            window.dispatchEvent(new Event('mystats-data-updated'));
          }
        } catch (err) {
          console.error('Import failed:', err);
          void import('@/lib/sentry').then(({ captureException }) =>
            captureException(err, { phase: 'backup_import', mode: 'parse_failed' })
          );
          alert(language === 'ko' ? '파일 형식이 올바르지 않습니다.' : 'Invalid file format.');
        }
      };
      reader.readAsText(file);
    },
    [language, onRefreshStorageMode, t]
  );

  const handleResetDb = useCallback(() => {
    const confirmed = window.confirm(t('dbResetConfirm'));
    if (!confirmed) return;
    setIsResettingDb(true);
    setResetMessage(t('dbResetting'));
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => {
        setIsResettingDb(false);
        try {
          localStorage.removeItem('MYSTATS_FALLBACK_JOURNAL');
          localStorage.removeItem('MYSTATS_FALLBACK_SKILLS');
          localStorage.removeItem('MYSTATS_FALLBACK_INSIGHTS');
        } catch {
          // Ignore storage errors
        }
        window.location.reload();
      };
      req.onerror = () => {
        setIsResettingDb(false);
        setResetMessage(t('dbResetFailed'));
        setTimeout(() => setResetMessage(null), 6000);
        void import('@/lib/sentry').then(({ captureException }) =>
          captureException(req.error ?? new Error('indexedDB.deleteDatabase failed'), { phase: 'db_reset', reason: 'error' })
        );
      };
      req.onblocked = () => {
        setIsResettingDb(false);
        setResetMessage(t('dbResetBlocked'));
        setTimeout(() => setResetMessage(null), 6000);
        void import('@/lib/sentry').then(({ captureException }) =>
          captureException(new Error('indexedDB.deleteDatabase blocked'), { phase: 'db_reset', reason: 'blocked' })
        );
      };
    } catch {
      setIsResettingDb(false);
      setResetMessage(t('dbResetFailed'));
      setTimeout(() => setResetMessage(null), 6000);
      void import('@/lib/sentry').then(({ captureException }) =>
        captureException(new Error('indexedDB.deleteDatabase threw'), { phase: 'db_reset', reason: 'exception' })
      );
    }
  }, [t]);

  const handleRebuildMirror = useCallback(async () => {
    setIsRebuildingMirror(true);
    setMirrorMessage(null);
    try {
      await updateMirror();
      const ts = readMirrorTimestamp();
      setMirrorLastUpdatedAt(ts);
      setMirrorMessage(language === 'ko' ? '미러 캐시를 재생성했습니다.' : 'Rebuilt mirror cache.');
    } catch (error) {
      setMirrorMessage(language === 'ko' ? '미러 재생성에 실패했습니다.' : 'Failed to rebuild mirror cache.');
      console.warn('Mirror rebuild failed', error);
      void import('@/lib/sentry').then(({ captureException }) =>
        captureException(error, { phase: 'mirror_rebuild' })
      );
    } finally {
      setIsRebuildingMirror(false);
    }
  }, [language]);

  const handleClearMirror = useCallback(() => {
    setMirrorMessage(null);
    try {
      localStorage.removeItem('MYSTATS_MIRROR_INSIGHTS');
      localStorage.removeItem('MYSTATS_MIRROR_SKILLS');
      localStorage.removeItem('MYSTATS_MIRROR_TS');
    } catch {
      // ignore
    }
    setMirrorLastUpdatedAt(null);
    setMirrorMessage(language === 'ko' ? '미러 캐시를 삭제했습니다.' : 'Cleared mirror cache.');
  }, [language]);

  return (
    <Card className="bg-secondary/10 border-border rounded-[3rem] overflow-hidden lg:col-span-2">
      <CardHeader className="p-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-2xl">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-2xl font-black tracking-tight">{t('settingsDataTitle')}</CardTitle>
            <CardDescription className="text-muted-foreground font-semibold">{t('settingsDataDesc')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-10 pt-0">
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="p-8 bg-background/40 rounded-[2rem] border border-border space-y-6">
            <div className="space-y-2">
              <h4 className="font-bold text-lg flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                {language === 'ko' ? '백업 다운로드' : 'Backup Download'}
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {language === 'ko'
                  ? '모든 데이터를 JSON 백업 파일로 다운로드합니다. 주기적인 백업을 권장합니다.'
                  : 'Download a JSON backup of all your data. Regular backups are recommended.'}
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>{t('exportIncludes')}</li>
                <li>{t('exportFallbackNote')}</li>
              </ul>
            </div>
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full h-12 rounded-xl font-bold tracking-tight bg-primary hover:bg-primary/90 disabled:opacity-50"
            >
              {isExporting
                ? language === 'ko'
                  ? '처리 중...'
                  : 'Processing...'
                : language === 'ko'
                  ? '백업 파일 다운로드'
                  : 'Download Backup'}
            </Button>
          </div>

          <div className="p-8 bg-background/40 rounded-[2rem] border border-border space-y-6">
            <div className="space-y-2">
              <h4 className="font-bold text-lg flex items-center gap-2">
                <Upload className="w-5 h-5 text-amber-500" />
                {language === 'ko' ? '백업 복원' : 'Restore from Backup'}
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {language === 'ko'
                  ? '백업 JSON 파일을 선택하여 데이터를 복원합니다. 기존 데이터는 업데이트됩니다.'
                  : 'Choose a backup JSON file to restore your data. Existing records will be updated.'}
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>{t('importMergeNote')}</li>
                <li>{t('importFallbackNote')}</li>
              </ul>
            </div>
            <div className="relative">
              <input type="file" accept=".json" onChange={handleImport} className="hidden" id="import-upload" />
              <label
                htmlFor="import-upload"
                className="flex items-center justify-center w-full h-12 rounded-xl font-bold tracking-tight border border-primary/20 bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors"
              >
                {language === 'ko' ? '백업 파일 선택' : 'Choose Backup File'}
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 p-6 bg-background/40 rounded-[2rem] border border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold">{language === 'ko' ? '로컬 데이터베이스 초기화' : 'Reset Local Database'}</p>
            <p className="text-xs text-muted-foreground">
              {language === 'ko' ? '브라우저에 저장된 모든 데이터를 삭제합니다.' : 'Erase all data stored in this browser.'}
            </p>
          </div>
          <Button variant="outline" onClick={handleResetDb} disabled={isResettingDb} className="h-10 px-4 font-bold tracking-tight">
            {t('dbReset')}
          </Button>
        </div>
        {resetMessage && <p className="mt-3 text-xs font-semibold text-muted-foreground">{resetMessage}</p>}

        <div className="mt-6 p-6 bg-background/40 rounded-[2rem] border border-border space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              {language === 'ko' ? 'Derived 캐시(미러) 관리' : 'Derived Cache (Mirror)'}
            </p>
            <p className="text-xs text-muted-foreground">
              {language === 'ko'
                ? 'IndexedDB의 일부 데이터를 localStorage에 미러링하는 “복구용 캐시”입니다. 필요 시 재생성/삭제할 수 있습니다.'
                : 'A recovery cache mirrored from IndexedDB into localStorage. You can rebuild/clear it if needed.'}
            </p>
            {mirrorLastUpdatedAt && (
              <p className="text-xs text-muted-foreground">
                {language === 'ko'
                  ? `마지막 갱신: ${new Date(mirrorLastUpdatedAt).toLocaleString()}`
                  : `Last updated: ${new Date(mirrorLastUpdatedAt).toLocaleString()}`}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={handleRebuildMirror}
              disabled={isRebuildingMirror}
              className="h-10 px-4 font-bold tracking-tight"
            >
              {isRebuildingMirror
                ? (language === 'ko' ? '재생성 중...' : 'Rebuilding...')
                : (language === 'ko' ? '미러 재생성' : 'Rebuild Mirror')}
            </Button>
            <Button
              variant="outline"
              onClick={handleClearMirror}
              className="h-10 px-4 font-bold tracking-tight"
            >
              {language === 'ko' ? '미러 삭제' : 'Clear Mirror'}
            </Button>
          </div>
          {mirrorMessage && <p className="text-xs font-semibold text-muted-foreground">{mirrorMessage}</p>}
        </div>

        <div className="mt-8 p-6 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-500/80 font-medium leading-relaxed">
            {language === 'ko'
              ? '주의: 데이터 불러오기 시 동일한 ID를 가진 기존 데이터는 덮어씌워집니다. 신중하게 진행해 주세요.'
              : 'Caution: Importing data will overwrite existing records with the same IDs. Please proceed with care.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
