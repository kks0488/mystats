import { useCallback, useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { getDB } from '../db/db';
import { getFallbackStorageMode } from '../db/fallback';
import { AISettingsCard } from './settings/AISettingsCard';
import { CloudSyncCard } from './settings/CloudSyncCard';
import { DataManagementCard } from './settings/DataManagementCard';
import { MemuSettingsCard } from './settings/MemuSettingsCard';

type StorageMode = 'db' | 'fallback' | 'memory';

export const Settings = () => {
  const { t } = useLanguage();
  const [storageMode, setStorageMode] = useState<StorageMode>('db');

  const refreshStorageMode = useCallback(async () => {
    try {
      await getDB();
      setStorageMode('db');
    } catch {
      setStorageMode(getFallbackStorageMode() === 'memory' ? 'memory' : 'fallback');
    }
  }, []);

  useEffect(() => {
    void refreshStorageMode();
  }, [refreshStorageMode]);

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
        <AISettingsCard />
        <CloudSyncCard />
        <MemuSettingsCard />
        <DataManagementCard onRefreshStorageMode={refreshStorageMode} />
      </div>
    </div>
  );
};

