import { useState, useEffect, useCallback } from 'react';
import {
  Settings2,
  ShieldCheck,
  CheckCircle2,
  Key,
  ChevronDown,
  Cpu,
  Download,
  Upload,
  Database,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../hooks/useLanguage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getAIConfig,
  getProviderConfig,
  setAIConfig,
  AI_PROVIDERS,
  type AIProvider,
} from '../lib/ai-provider';
import {
  exportAllData,
  importAllData,
  getDB,
  DB_NAME,
  type Skill,
  type Insight,
  type JournalEntry,
} from '../db/db';
import {
  loadFallbackJournalEntries,
  loadFallbackSkills,
  loadFallbackInsights,
  replaceFallbackJournalEntries,
  replaceFallbackSkills,
  replaceFallbackInsights,
  getFallbackStorageMode,
} from '../db/fallback';

type StorageMode = 'db' | 'fallback' | 'memory';

const API_KEY_LINKS: Record<AIProvider, string> = {
  gemini: 'https://aistudio.google.com/app/apikey',
  openai: 'https://platform.openai.com/api-keys',
  claude: 'https://console.anthropic.com/settings/keys',
  grok: 'https://console.x.ai/',
};

const normalizeSkillName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?;:]+$/g, '')
    .toLowerCase();

const mergeById = <T extends { id?: string }>(items: T[]) => {
  const map = new Map<string, T>();
  for (const item of items) {
    const id = item?.id;
    if (typeof id !== 'string' || !id.trim()) continue;
    map.set(id, item);
  }
  return Array.from(map.values());
};

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

export const Settings = () => {
  const { t, language } = useLanguage();
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isResettingDb, setIsResettingDb] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>('db');

  const providerInfo = AI_PROVIDERS[provider];
  const apiKeyLink = API_KEY_LINKS[provider];

  const refreshStorageMode = useCallback(async () => {
    try {
      await getDB();
      setStorageMode('db');
    } catch {
      setStorageMode(getFallbackStorageMode() === 'memory' ? 'memory' : 'fallback');
    }
  }, []);

  useEffect(() => {
    const config = getAIConfig();
    setProvider(config.provider);
    setApiKey(config.apiKey);
    setSelectedModel(config.model || AI_PROVIDERS[config.provider].defaultModel);
    refreshStorageMode();
  }, [refreshStorageMode]);

  const handleProviderChange = (newProvider: AIProvider) => {
    const config = getProviderConfig(newProvider);
    setProvider(newProvider);
    setSelectedModel(config.model || AI_PROVIDERS[newProvider].defaultModel);
    setApiKey(config.apiKey);
    setShowProviderDropdown(false);
  };

  const handleSaveKey = () => {
    setAIConfig({
      provider,
      apiKey,
      model: selectedModel,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      let data: Record<string, unknown[]> = { journal: [], skills: [], solutions: [], insights: [] };
      let dbAvailable = true;
      try {
        data = await exportAllData();
      } catch (err) {
        console.warn('Export failed from DB, falling back', err);
        dbAvailable = false;
      }
      const fallback = {
        journal: loadFallbackJournalEntries(),
        skills: loadFallbackSkills(),
        insights: loadFallbackInsights(),
      };
      const hasFallback = fallback.journal.length > 0 || fallback.skills.length > 0 || fallback.insights.length > 0;
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
      refreshStorageMode();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmImport = window.confirm(
      language === 'ko'
        ? '데이터를 복원하시겠습니까? 동일한 ID의 데이터는 덮어씌워집니다.'
        : 'Are you sure you want to restore data? Existing data with the same IDs will be overwritten.'
    );
    if (!confirmImport) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const raw = JSON.parse(event.target?.result as string);
        const data = raw && typeof raw === 'object' ? raw : {};
        const baseData = {
          journal: Array.isArray(data.journal)
            ? data.journal
            : Array.isArray(data.entries)
              ? data.entries
              : [],
          skills: Array.isArray(data.skills) ? data.skills : [],
          solutions: Array.isArray(data.solutions) ? data.solutions : [],
          insights: Array.isArray(data.insights) ? data.insights : [],
        };
        const fallbackData = data.fallback && typeof data.fallback === 'object'
          ? {
              journal: Array.isArray(data.fallback.journal)
                ? data.fallback.journal
                : Array.isArray(data.fallback.entries)
                  ? data.fallback.entries
                  : [],
              skills: Array.isArray(data.fallback.skills) ? data.fallback.skills : [],
              insights: Array.isArray(data.fallback.insights) ? data.fallback.insights : [],
            }
          : { journal: [], skills: [], insights: [] };
        const hasFallback = fallbackData.journal.length > 0 || fallbackData.skills.length > 0 || fallbackData.insights.length > 0;

        let includeFallback = hasFallback;
        if (hasFallback) {
          includeFallback = window.confirm(t('importFallbackWarning'));
        }

        const selectedJournal = (includeFallback
          ? [...baseData.journal, ...fallbackData.journal]
          : [...baseData.journal]) as JournalEntry[];
        const selectedSkills = (includeFallback
          ? [...baseData.skills, ...fallbackData.skills]
          : [...baseData.skills]) as Skill[];
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
          .replace('{insights}', String(mergedInsights.length));

        try {
          await importAllData({
            journal: mergedJournal,
            skills: mergedSkills,
            solutions: mergedSolutions,
            insights: mergedInsights,
          });
          alert(
            mergedJournal.length || mergedSkills.length || mergedInsights.length
              ? summaryText
              : t('importEmpty')
          );
          refreshStorageMode();
          window.dispatchEvent(new Event('mystats-data-updated'));
        } catch (err) {
          console.warn('DB import failed. Saving to fallback only.', err);
          replaceFallbackJournalEntries(rawJournal);
          replaceFallbackSkills(rawSkills);
          replaceFallbackInsights(rawInsights);
          alert(
            mergedJournal.length || mergedSkills.length || mergedInsights.length
              ? `${t('importFallbackOnly')}\n${summaryText}`
              : `${t('importFallbackOnly')}\n${t('importEmpty')}`
          );
          refreshStorageMode();
          window.dispatchEvent(new Event('mystats-data-updated'));
        }
      } catch (err) {
        console.error('Import failed:', err);
        alert(language === 'ko' ? '파일 형식이 올바르지 않습니다.' : 'Invalid file format.');
      }
    };
    reader.readAsText(file);
  };

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
      };
      req.onblocked = () => {
        setIsResettingDb(false);
        setResetMessage(t('dbResetBlocked'));
        setTimeout(() => setResetMessage(null), 6000);
      };
    } catch {
      setIsResettingDb(false);
      setResetMessage(t('dbResetFailed'));
      setTimeout(() => setResetMessage(null), 6000);
    }
  }, [t]);

  const storageLabel =
    storageMode === 'db'
      ? t('storageModeDb')
      : storageMode === 'memory'
        ? t('storageModeMemory')
        : t('storageModeFallback');

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-20">
      <header className="space-y-4">
        <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold uppercase tracking-[0.3em]">
          <Settings2 className="w-4 h-4" />
          {t('settingsTitle')}
        </div>
        <h1 className="text-5xl font-black tracking-tighter">{t('settingsTitle')}</h1>
        <p className="text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
          {t('settingsDesc')}
        </p>
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {t('storageModeLabel')}: {storageLabel}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-secondary/20 border-border backdrop-blur-xl rounded-[2rem] overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 text-primary rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight">{t('configuration')}</CardTitle>
            </div>
            <CardDescription className="font-semibold text-muted-foreground">{t('setupEnv')}</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-4 space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                AI Provider
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                  className="w-full flex items-center justify-between h-12 rounded-xl border border-input bg-background/50 px-4 text-sm font-medium hover:bg-background/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Cpu className="w-4 h-4 text-primary" />
                    <span>{providerInfo.name}</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-muted-foreground transition-transform",
                      showProviderDropdown && "rotate-180"
                    )}
                  />
                </button>
                <AnimatePresence>
                  {showProviderDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.1 }}
                      className="absolute z-10 w-full mt-2 bg-background border border-border rounded-xl shadow-xl overflow-hidden"
                    >
                      {(Object.keys(AI_PROVIDERS) as AIProvider[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => handleProviderChange(p)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-secondary transition-colors text-left",
                            p === provider && "bg-primary/10 text-primary"
                          )}
                        >
                          <Cpu className="w-4 h-4" />
                          {AI_PROVIDERS[p].name}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                Model
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="w-full flex items-center justify-between h-12 rounded-xl border border-input bg-background/50 px-4 text-sm font-medium hover:bg-background/80 transition-colors"
                >
                  <span className="font-mono text-xs">{selectedModel}</span>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-muted-foreground transition-transform",
                      showModelDropdown && "rotate-180"
                    )}
                  />
                </button>
                <AnimatePresence>
                  {showModelDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.1 }}
                      className="absolute z-10 w-full mt-2 bg-background border border-border rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto"
                    >
                      {providerInfo.models.map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setSelectedModel(m);
                            setShowModelDropdown(false);
                          }}
                          className={cn(
                            "w-full px-4 py-3 text-sm font-mono hover:bg-secondary transition-colors text-left",
                            m === selectedModel && "bg-primary/10 text-primary"
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                {providerInfo.name} API Key
              </label>
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-hover:text-primary" />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full flex h-12 rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-11 focus:ring-primary/20"
                  placeholder={provider === 'gemini' ? 'AIza...' : provider === 'openai' ? 'sk-...' : 'Enter API key...'}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Button onClick={handleSaveKey} className="w-full h-12 rounded-xl font-bold tracking-tight transition-all active:scale-[0.98]">
                <AnimatePresence mode="wait">
                  {isSaved ? (
                    <motion.div key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {t('saved')}
                    </motion.div>
                  ) : (
                    <motion.div key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      {t('saveKey')}
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
              <div className="space-y-2 text-center">
                <p className="text-xs text-muted-foreground leading-relaxed px-4">
                  {t('apiKeyNote')}
                </p>
                <a
                  href={apiKeyLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-primary hover:underline underline-offset-4"
                >
                  {t('getApiKey')}
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-secondary/10 border-border rounded-[3rem] overflow-hidden">
          <CardHeader className="p-10">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black tracking-tight">{t('settingsDataTitle')}</CardTitle>
                <CardDescription className="text-muted-foreground font-semibold">
                  {t('settingsDataDesc')}
                </CardDescription>
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
                    ? (language === 'ko' ? '처리 중...' : 'Processing...')
                    : (language === 'ko' ? '백업 파일 다운로드' : 'Download Backup')}
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
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    className="hidden"
                    id="import-upload"
                  />
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
                <p className="text-sm font-semibold">
                  {language === 'ko' ? '로컬 데이터베이스 초기화' : 'Reset Local Database'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {language === 'ko'
                    ? '브라우저에 저장된 모든 데이터를 삭제합니다.'
                    : 'Erase all data stored in this browser.'}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleResetDb}
                disabled={isResettingDb}
                className="h-10 px-4 font-bold tracking-tight"
              >
                {t('dbReset')}
              </Button>
            </div>
            {resetMessage && (
              <p className="mt-3 text-xs font-semibold text-muted-foreground">
                {resetMessage}
              </p>
            )}

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
      </div>
    </div>
  );
};
