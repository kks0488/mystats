import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import {
  cloudSignInWithOAuth,
  cloudSignInWithPassword,
  cloudSignOut,
  cloudSignUpWithPassword,
  getCloudLastSyncedAt,
  getCloudSyncConfig,
  getCloudUserInfo,
  setCloudSyncConfig,
  syncNowWithRetry,
} from '@/lib/cloudSync';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export function CloudSyncCard() {
  const { t } = useLanguage();
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudUser, setCloudUser] = useState<{ id: string; email: string | null; provider: string | null } | null>(null);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [cloudAutoSync, setCloudAutoSync] = useState(true);
  const [cloudLastSyncedAt, setCloudLastSyncedAt] = useState<number | null>(null);
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'syncing' | 'ok' | 'fail'>('idle');
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const oauthProviders = useMemo(() => {
    const raw = (import.meta.env.VITE_CLOUD_OAUTH_PROVIDERS as string | undefined) || 'google';
    const parsed = raw
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    const allowed = new Set(['google', 'github']);
    const normalized = Array.from(new Set(parsed.filter((p) => allowed.has(p))));
    return normalized as Array<'google' | 'github'>;
  }, []);

  const canSubmitPassword = useMemo(() => {
    return Boolean(cloudEmail.trim() && cloudPassword);
  }, [cloudEmail, cloudPassword]);

  useEffect(() => {
    setCloudConfigured(isSupabaseConfigured());
    const cloudConfig = getCloudSyncConfig();
    setCloudEnabled(cloudConfig.enabled);
    setCloudAutoSync(cloudConfig.autoSync);
    setCloudLastSyncedAt(getCloudLastSyncedAt());

    if (!isSupabaseConfigured()) return;

    void getCloudUserInfo().then(setCloudUser);
    const supabase = getSupabaseClient();
    const { data } =
      supabase?.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        if (!user?.id) {
          setCloudUser(null);
          setAuthLoading(false);
          return;
        }
        const email = typeof user.email === 'string' ? user.email : null;
        const provider =
          typeof (user.app_metadata as Record<string, unknown> | null | undefined)?.provider === 'string'
            ? ((user.app_metadata as Record<string, unknown>).provider as string)
            : null;
        setCloudUser({ id: user.id, email, provider });
        setAuthLoading(false);
      }) ?? { data: null };
    return () => {
      data?.subscription?.unsubscribe();
    };
  }, []);

  const handleOAuthSignIn = useCallback(
    async (provider: 'google' | 'github') => {
      setCloudMessage(null);
      setCloudStatus('idle');
      setAuthLoading(true);
      const result = await cloudSignInWithOAuth(provider);
      if (!result.ok) {
        setAuthLoading(false);
        setCloudStatus('fail');
        setCloudMessage(result.message || t('cloudSyncFail'));
      }
    },
    [t]
  );

  const handlePasswordSignIn = useCallback(async () => {
    if (!canSubmitPassword) return;
    setCloudMessage(null);
    setCloudStatus('idle');
    setAuthLoading(true);
    const result = await cloudSignInWithPassword(cloudEmail, cloudPassword);
    setAuthLoading(false);
    if (result.ok) {
      setCloudStatus('ok');
      return;
    }
    setCloudStatus('fail');
    setCloudMessage(result.message || t('cloudSyncFail'));
  }, [canSubmitPassword, cloudEmail, cloudPassword, t]);

  const handlePasswordSignUp = useCallback(async () => {
    if (!canSubmitPassword) return;
    setCloudMessage(null);
    setCloudStatus('idle');
    setAuthLoading(true);
    const result = await cloudSignUpWithPassword(cloudEmail, cloudPassword);
    setAuthLoading(false);
    if (result.ok) {
      setCloudStatus('ok');
      setCloudMessage(t('cloudSignUpSuccess'));
      return;
    }
    setCloudStatus('fail');
    setCloudMessage(result.message || t('cloudSyncFail'));
  }, [canSubmitPassword, cloudEmail, cloudPassword, t]);

  const handleCloudSignOut = useCallback(async () => {
    setCloudMessage(null);
    setCloudStatus('idle');
    await cloudSignOut();
    setCloudUser(null);
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
            {cloudUser ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background/40">
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold">{t('cloudSignedInAs')}</p>
                    <p className="text-xs text-muted-foreground">
                      {cloudUser.email ?? `${cloudUser.provider ?? 'user'}:${cloudUser.id.slice(0, 8)}…`}
                    </p>
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
                <div className="space-y-3">
                  {oauthProviders.includes('google') && (
                    <Button
                      onClick={() => handleOAuthSignIn('google')}
                      disabled={authLoading}
                      className="w-full h-12 rounded-xl font-bold tracking-tight"
                    >
                      {t('cloudSignInGoogle')}
                    </Button>
                  )}
                  {oauthProviders.includes('github') && (
                    <Button
                      variant="outline"
                      onClick={() => handleOAuthSignIn('github')}
                      disabled={authLoading}
                      className="w-full h-12 rounded-xl font-bold tracking-tight"
                    >
                      {t('cloudSignInGithub')}
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t('cloudOrDivider')}
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>

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
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="cloud-password" className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                    {t('cloudPassword')}
                  </label>
                  <input
                    id="cloud-password"
                    type="password"
                    value={cloudPassword}
                    onChange={(e) => setCloudPassword(e.target.value)}
                    className="w-full flex h-12 rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder={t('cloudPasswordPlaceholder')}
                    autoComplete="current-password"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={handlePasswordSignIn}
                    disabled={authLoading || !canSubmitPassword}
                    className="w-full h-12 rounded-xl font-bold tracking-tight"
                  >
                    {t('cloudSignIn')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handlePasswordSignUp}
                    disabled={authLoading || !canSubmitPassword}
                    className="w-full h-12 rounded-xl font-bold tracking-tight"
                  >
                    {t('cloudSignUp')}
                  </Button>
                </div>
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
