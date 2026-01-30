import { useCallback, useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import {
  cloudSignInWithEmail,
  cloudSignOut,
  getCloudLastSyncedAt,
  getCloudSyncConfig,
  getCloudUserEmail,
  setCloudSyncConfig,
  syncNowWithRetry,
} from '@/lib/cloudSync';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export function CloudSyncCard() {
  const { t } = useLanguage();
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [cloudAutoSync, setCloudAutoSync] = useState(true);
  const [cloudLastSyncedAt, setCloudLastSyncedAt] = useState<number | null>(null);
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'syncing' | 'ok' | 'fail'>('idle');
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudLinkSent, setCloudLinkSent] = useState(false);

  useEffect(() => {
    setCloudConfigured(isSupabaseConfigured());
    const cloudConfig = getCloudSyncConfig();
    setCloudEnabled(cloudConfig.enabled);
    setCloudAutoSync(cloudConfig.autoSync);
    setCloudLastSyncedAt(getCloudLastSyncedAt());

    if (!isSupabaseConfigured()) return;

    void getCloudUserEmail().then(setCloudUserEmail);
    const supabase = getSupabaseClient();
    const { data } =
      supabase?.auth.onAuthStateChange((_event, session) => {
        setCloudUserEmail(session?.user?.email ?? null);
        setCloudLinkSent(false);
      }) ?? { data: null };
    return () => {
      data?.subscription?.unsubscribe();
    };
  }, []);

  const handleSendCloudLink = useCallback(async () => {
    setCloudMessage(null);
    setCloudLinkSent(false);
    setCloudStatus('idle');
    const result = await cloudSignInWithEmail(cloudEmail);
    if (result.ok) {
      setCloudLinkSent(true);
      setCloudStatus('ok');
      setCloudMessage(t('cloudLinkSent'));
      return;
    }
    setCloudStatus('fail');
    setCloudMessage(result.message || t('cloudSyncFail'));
  }, [cloudEmail, t]);

  const handleCloudSignOut = useCallback(async () => {
    setCloudMessage(null);
    setCloudStatus('idle');
    await cloudSignOut();
    setCloudUserEmail(null);
  }, []);

  const handleCloudSyncNow = useCallback(async () => {
    setCloudMessage(null);
    setCloudStatus('syncing');
    try {
      const result = await syncNowWithRetry();
      if (result.ok) {
        setCloudStatus('ok');
        setCloudLastSyncedAt(getCloudLastSyncedAt());
        setCloudMessage(`${t('cloudSyncOk')} · ${result.appliedRemote}↓ ${result.pushedLocal}↑`);
      } else {
        setCloudStatus('fail');
        setCloudMessage(result.message || t('cloudSyncFail'));
      }
    } catch (err) {
      setCloudStatus('fail');
      setCloudMessage(err instanceof Error ? err.message : t('cloudSyncFail'));
    }
  }, [t]);

  return (
    <Card className="bg-secondary/20 border-border backdrop-blur-xl rounded-[2rem] overflow-hidden">
      <CardHeader className="p-8 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 text-primary rounded-xl">
            <Cloud className="w-5 h-5" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">{t('cloudTitle')}</CardTitle>
        </div>
        <CardDescription className="font-semibold text-muted-foreground">{t('cloudDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="p-8 pt-4 space-y-6">
        {!cloudConfigured ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{t('cloudNotConfigured')}</p>
        ) : (
          <>
            {cloudUserEmail ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background/40">
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold">{t('cloudSignedInAs')}</p>
                    <p className="text-xs text-muted-foreground">{cloudUserEmail}</p>
                  </div>
                  <Button variant="outline" onClick={handleCloudSignOut} className="h-10 px-4 rounded-xl font-bold">
                    {t('cloudSignOut')}
                  </Button>
                </div>

                <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background/40">
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold">{t('cloudEnable')}</p>
                    <p className="text-xs text-muted-foreground">{t('cloudEnableDesc')}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={cloudEnabled}
                    onChange={(e) => {
                      const next = setCloudSyncConfig({ enabled: e.target.checked });
                      setCloudEnabled(next.enabled);
                    }}
                    className="h-5 w-5 accent-primary"
                  />
                </label>

                <label
                  className={cn(
                    'flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background/40',
                    !cloudEnabled && 'opacity-60'
                  )}
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold">{t('cloudAutoSync')}</p>
                    <p className="text-xs text-muted-foreground">{t('cloudAutoSyncDesc')}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={cloudAutoSync}
                    onChange={(e) => {
                      const next = setCloudSyncConfig({ autoSync: e.target.checked });
                      setCloudAutoSync(next.autoSync);
                    }}
                    className="h-5 w-5 accent-primary"
                    disabled={!cloudEnabled}
                  />
                </label>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    onClick={handleCloudSyncNow}
                    disabled={!cloudEnabled || cloudStatus === 'syncing'}
                    className="w-full h-12 rounded-xl font-bold tracking-tight"
                  >
                    {cloudStatus === 'syncing' ? t('cloudSyncing') : t('cloudSyncNow')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="cloud-email" className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                    {t('cloudEmail')}
                  </label>
                  <input
                    id="cloud-email"
                    value={cloudEmail}
                    onChange={(e) => setCloudEmail(e.target.value)}
                    className="w-full flex h-12 rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder={t('cloudEmailPlaceholder')}
                  />
                </div>
                <Button onClick={handleSendCloudLink} className="w-full h-12 rounded-xl font-bold tracking-tight">
                  {t('cloudSendLink')}
                </Button>
                {cloudLinkSent && <p className="text-xs text-muted-foreground">{t('cloudLinkSent')}</p>}
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
              {cloudLastSyncedAt && (
                <p>
                  {t('cloudLastSynced')}: {new Date(cloudLastSyncedAt).toLocaleString()}
                </p>
              )}
              {cloudMessage && (
                <p className={cn('font-semibold', cloudStatus === 'fail' ? 'text-amber-500' : 'text-emerald-500')}>
                  {cloudMessage}
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
