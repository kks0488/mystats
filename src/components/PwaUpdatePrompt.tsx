import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/hooks/useLanguage';

export function PwaUpdatePrompt() {
  const { t } = useLanguage();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error: unknown) {
      console.error('PWA registration error', error);
    },
  });

  const visible = needRefresh || offlineReady;
  if (!visible) return null;

  const title = needRefresh ? t('pwaUpdateAvailable') : t('pwaOfflineReady');
  const desc = needRefresh ? t('pwaUpdateDesc') : t('pwaOfflineDesc');

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  const reload = async () => {
    await updateServiceWorker(true);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))]">
      <Card className="bg-secondary/40 border-border backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl">
        <CardContent className="p-5 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-black tracking-tight">{title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </div>
          <div className="flex gap-2">
            {needRefresh && (
              <Button onClick={reload} className="h-10 px-4 rounded-xl font-bold">
                {t('pwaReload')}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={close}
              className="h-10 px-4 rounded-xl font-bold"
            >
              {needRefresh ? t('pwaDismiss') : t('pwaOk')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
