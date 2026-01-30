import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import { getMemuConfig, memuHealth, setMemuConfig, type MemuConfig, type MemuEngine } from '@/lib/memu';

export function MemuSettingsCard() {
  const { t, language } = useLanguage();
  const [memuEnabled, setMemuEnabled] = useState(false);
  const [memuEngine, setMemuEngine] = useState<MemuEngine>('embedded');
  const [memuBaseUrl, setMemuBaseUrl] = useState('');
  const [memuUserId, setMemuUserId] = useState('');
  const [memuStoreJournal, setMemuStoreJournal] = useState(true);
  const [memuUseInStrategy, setMemuUseInStrategy] = useState(true);
  const [memuIncludeProjectRegistry, setMemuIncludeProjectRegistry] = useState(false);
  const [memuDedupeBeforeStore, setMemuDedupeBeforeStore] = useState(true);
  const [memuDedupeThreshold, setMemuDedupeThreshold] = useState('0.92');
  const [memuTesting, setMemuTesting] = useState(false);
  const [memuStatus, setMemuStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [isMemuSaved, setIsMemuSaved] = useState(false);

  useEffect(() => {
    const memuConfig = getMemuConfig();
    setMemuEnabled(memuConfig.enabled);
    setMemuEngine(memuConfig.engine);
    setMemuBaseUrl(memuConfig.baseUrl);
    setMemuUserId(memuConfig.userId);
    setMemuStoreJournal(memuConfig.storeJournal);
    setMemuUseInStrategy(memuConfig.useInStrategy);
    setMemuIncludeProjectRegistry(memuConfig.includeProjectRegistryInStrategy);
    setMemuDedupeBeforeStore(memuConfig.dedupeBeforeStore);
    setMemuDedupeThreshold(String(memuConfig.dedupeThreshold));
  }, []);

  const handleSaveMemu = useCallback(() => {
    const next = setMemuConfig({
      enabled: memuEnabled,
      engine: memuEngine,
      baseUrl: memuBaseUrl,
      userId: memuUserId,
      storeJournal: memuStoreJournal,
      useInStrategy: memuUseInStrategy,
      includeProjectRegistryInStrategy: memuIncludeProjectRegistry,
      dedupeBeforeStore: memuDedupeBeforeStore,
      dedupeThreshold: Number(memuDedupeThreshold),
    });
    setMemuBaseUrl(next.baseUrl);
    setMemuUserId(next.userId);
    setMemuStoreJournal(next.storeJournal);
    setMemuUseInStrategy(next.useInStrategy);
    setMemuIncludeProjectRegistry(next.includeProjectRegistryInStrategy);
    setMemuDedupeBeforeStore(next.dedupeBeforeStore);
    setMemuDedupeThreshold(String(next.dedupeThreshold));
    setIsMemuSaved(true);
    setTimeout(() => setIsMemuSaved(false), 2000);
  }, [
    memuBaseUrl,
    memuDedupeBeforeStore,
    memuDedupeThreshold,
    memuEnabled,
    memuEngine,
    memuIncludeProjectRegistry,
    memuStoreJournal,
    memuUseInStrategy,
    memuUserId,
  ]);

  const handleTestMemu = useCallback(async () => {
    setMemuTesting(true);
    setMemuStatus('idle');
    const tempConfig: MemuConfig = {
      ...getMemuConfig(),
      enabled: memuEnabled,
      engine: memuEngine,
      baseUrl: memuBaseUrl,
      userId: memuUserId,
      storeJournal: memuStoreJournal,
      useInStrategy: memuUseInStrategy,
      includeProjectRegistryInStrategy: memuIncludeProjectRegistry,
      dedupeBeforeStore: memuDedupeBeforeStore,
      dedupeThreshold: Number(memuDedupeThreshold),
    };
    try {
      const ok = await memuHealth(tempConfig);
      setMemuStatus(ok ? 'ok' : 'fail');
    } finally {
      setMemuTesting(false);
    }
  }, [
    memuBaseUrl,
    memuDedupeBeforeStore,
    memuDedupeThreshold,
    memuEnabled,
    memuEngine,
    memuIncludeProjectRegistry,
    memuStoreJournal,
    memuUseInStrategy,
    memuUserId,
  ]);

  return (
    <Card className="bg-secondary/20 border-border backdrop-blur-xl rounded-[2rem] overflow-hidden">
      <CardHeader className="p-8 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 text-primary rounded-xl">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">{t('memuTitle')}</CardTitle>
        </div>
        <CardDescription className="font-semibold text-muted-foreground">{t('memuDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="p-8 pt-4 space-y-6">
        <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background/40">
          <div className="space-y-0.5">
            <p className="text-sm font-bold">{t('memuEnable')}</p>
            <p className="text-xs text-muted-foreground">{t('memuEnableDesc')}</p>
          </div>
          <input
            type="checkbox"
            checked={memuEnabled}
            onChange={(e) => setMemuEnabled(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>

        <div className="space-y-2">
          <label htmlFor="memu-engine-select" className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
            {t('memuEngine')}
          </label>
          <select
            id="memu-engine-select"
            value={memuEngine}
            onChange={(e) => setMemuEngine(e.target.value as MemuEngine)}
            disabled={!memuEnabled}
            className="w-full flex h-12 rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="embedded">{t('memuEngineEmbedded')}</option>
            <option value="api">{t('memuEngineApi')}</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {memuEngine === 'embedded' ? t('memuEngineEmbeddedDesc') : t('memuEngineApiDesc')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {memuEngine === 'api' && (
            <div className="space-y-2">
              <label htmlFor="memu-api-url" className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                {t('memuApiUrl')}
              </label>
              <input
                id="memu-api-url"
                value={memuBaseUrl}
                onChange={(e) => setMemuBaseUrl(e.target.value)}
                className="w-full flex h-12 rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="/api/memu"
                disabled={!memuEnabled}
              />
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="memu-user-id" className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
              {t('memuUserId')}
            </label>
            <input
              id="memu-user-id"
              value={memuUserId}
              onChange={(e) => setMemuUserId(e.target.value)}
              className="w-full flex h-12 rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="mystats"
              disabled={!memuEnabled}
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background/40">
            <div className="space-y-0.5">
              <p className="text-sm font-bold">{t('memuStoreJournal')}</p>
              <p className="text-xs text-muted-foreground">{t('memuStoreJournalDesc')}</p>
            </div>
            <input
              type="checkbox"
              checked={memuStoreJournal}
              onChange={(e) => setMemuStoreJournal(e.target.checked)}
              className="h-5 w-5 accent-primary"
              disabled={!memuEnabled}
            />
          </label>

          <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background/40">
            <div className="space-y-0.5">
              <p className="text-sm font-bold">{t('memuUseInStrategy')}</p>
              <p className="text-xs text-muted-foreground">{t('memuUseInStrategyDesc')}</p>
            </div>
            <input
              type="checkbox"
              checked={memuUseInStrategy}
              onChange={(e) => setMemuUseInStrategy(e.target.checked)}
              className="h-5 w-5 accent-primary"
              disabled={!memuEnabled}
            />
          </label>

          {memuEngine === 'api' && (
            <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background/40">
              <div className="space-y-0.5">
                <p className="text-sm font-bold">{t('memuIncludeProjectRegistry')}</p>
                <p className="text-xs text-muted-foreground">{t('memuIncludeProjectRegistryDesc')}</p>
              </div>
              <input
                type="checkbox"
                checked={memuIncludeProjectRegistry}
                onChange={(e) => setMemuIncludeProjectRegistry(e.target.checked)}
                className="h-5 w-5 accent-primary"
                disabled={!memuEnabled || !memuUseInStrategy}
              />
            </label>
          )}
        </div>

        {memuEngine === 'api' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <label
              className={cn(
                'flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background/40',
                !memuEnabled && 'opacity-60'
              )}
            >
              <div className="space-y-0.5">
                <p className="text-sm font-bold">{t('memuDedupe')}</p>
                <p className="text-xs text-muted-foreground">{t('memuDedupeDesc')}</p>
              </div>
              <input
                type="checkbox"
                checked={memuDedupeBeforeStore}
                onChange={(e) => setMemuDedupeBeforeStore(e.target.checked)}
                className="h-5 w-5 accent-primary"
                disabled={!memuEnabled || !memuStoreJournal}
              />
            </label>

            <div className="space-y-2">
              <label htmlFor="memu-threshold" className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                {t('memuThreshold')}
              </label>
              <input
                id="memu-threshold"
                value={memuDedupeThreshold}
                onChange={(e) => setMemuDedupeThreshold(e.target.value)}
                className="w-full flex h-12 rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="0.92"
                disabled={!memuEnabled || !memuStoreJournal || !memuDedupeBeforeStore}
              />
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={handleTestMemu}
              disabled={!memuEnabled || memuTesting}
              className="w-full h-12 rounded-xl font-bold tracking-tight"
            >
              {memuTesting ? (language === 'ko' ? '확인 중...' : 'Testing...') : t('memuTest')}
            </Button>
            <Button
              onClick={handleSaveMemu}
              className="w-full h-12 rounded-xl font-bold tracking-tight transition-all active:scale-[0.98]"
            >
              <AnimatePresence mode="wait">
                {isMemuSaved ? (
                  <motion.div
                    key="saved"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {t('saved')}
                  </motion.div>
                ) : (
                  <motion.div
                    key="save"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <BrainCircuit className="w-4 h-4" />
                    {t('memuSave')}
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{t('memuPrivacyNote')}</p>
            {memuEnabled && memuStatus !== 'idle' && (
              <p className={cn('font-semibold', memuStatus === 'ok' ? 'text-emerald-500' : 'text-amber-500')}>
                {memuStatus === 'ok' ? t('memuStatusOk') : t('memuStatusFail')}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

