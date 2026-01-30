import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { LanguageProvider } from './lib/LanguageProvider';
import { useEffect, Suspense, lazy } from 'react';
import { migrateData, recoverFromMirror } from './db/db';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';

const Home = lazy(() => import('./pages/Home').then(module => ({ default: module.Home })));
const Journal = lazy(() => import('./pages/Journal').then(module => ({ default: module.Journal })));
const Profile = lazy(() => import('./pages/Profile').then(module => ({ default: module.Profile })));
const Strategy = lazy(() => import('./pages/Strategy').then(module => ({ default: module.Strategy })));
const Settings = lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })));

function App() {
  useEffect(() => {
    let stopCloudSync = () => {};

    const init = async () => {
      try {
        if (import.meta.env.VITE_SENTRY_DSN) {
          const { initSentry } = await import('./lib/sentry');
          await initSentry();
        }
        await migrateData();
        await recoverFromMirror();
        
        // Demo data seeding removed
      } catch (err) {
        console.error("Initialization failed:", err);
        if (import.meta.env.VITE_SENTRY_DSN) {
          void import('./lib/sentry').then(({ captureException }) =>
            captureException(err, { phase: 'app_init' })
          );
        }
      }
    };
    init();

    const maybeStartCloudSync = () => {
      const configured = Boolean(
        import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      if (!configured) return;

      let enabled = false;
      try {
        const raw = localStorage.getItem('MYSTATS_CLOUD_SYNC_CONFIG_V1');
        if (raw) enabled = Boolean(JSON.parse(raw)?.enabled);
      } catch {
        enabled = false;
      }
      if (!enabled) return;

      void import('./lib/cloudSyncManager').then(({ startCloudSyncManager }) => {
        stopCloudSync = startCloudSyncManager();
      });
    };

    const onCloudConfig = () => maybeStartCloudSync();
    window.addEventListener('mystats-cloud-sync-config', onCloudConfig);
    maybeStartCloudSync();

    return () => {
      window.removeEventListener('mystats-cloud-sync-config', onCloudConfig);
      stopCloudSync();
    };
  }, []);

  const pageFallback = (
    <div className="flex items-center justify-center min-h-[60vh] text-sm font-semibold text-muted-foreground">
      Loading...
    </div>
  );

  return (
    <LanguageProvider>
      <PwaUpdatePrompt />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Shell><Outlet /></Shell>}>
            <Route index element={<Suspense fallback={pageFallback}><Home /></Suspense>} />
            <Route path="journal" element={<Suspense fallback={pageFallback}><Journal /></Suspense>} />
            <Route path="profile" element={<Suspense fallback={pageFallback}><Profile /></Suspense>} />
            <Route path="strategy" element={<Suspense fallback={pageFallback}><Strategy /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={pageFallback}><Settings /></Suspense>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;
