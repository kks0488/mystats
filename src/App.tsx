import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { LanguageProvider } from './lib/LanguageProvider';
import { useEffect, Suspense, lazy } from 'react';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { bootstrapAppInfra, startCloudSyncIfEnabled } from './bootstrap/appInit';

const Home = lazy(() => import('./pages/Home').then(module => ({ default: module.Home })));
const Journal = lazy(() => import('./pages/Journal').then(module => ({ default: module.Journal })));
const Profile = lazy(() => import('./pages/Profile').then(module => ({ default: module.Profile })));
const Strategy = lazy(() => import('./pages/Strategy').then(module => ({ default: module.Strategy })));
const Settings = lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })));

function App() {
  useEffect(() => {
    let stopCloudSync = () => {};
    let disposed = false;

    const init = async () => {
      try {
        await bootstrapAppInfra();
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

    const refreshCloudSync = () => {
      stopCloudSync();
      stopCloudSync = () => {};
      void startCloudSyncIfEnabled().then((stop) => {
        if (disposed) {
          stop();
          return;
        }
        stopCloudSync = stop;
      });
    };

    const onCloudConfig = () => refreshCloudSync();
    window.addEventListener('mystats-cloud-sync-config', onCloudConfig);
    refreshCloudSync();

    return () => {
      disposed = true;
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
