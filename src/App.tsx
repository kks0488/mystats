import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { Home } from './pages/Home';
import { Journal } from './pages/Journal';
import { Profile } from './pages/Profile';
import { Strategy } from './pages/Strategy';
import { LanguageProvider } from './lib/LanguageProvider';
import { useEffect } from 'react';
import { migrateData } from './db/db';

function App() {
  useEffect(() => {
    const init = async () => {
      try {
        await migrateData();
        const { recoverFromMirror } = await import('./db/db');
        await recoverFromMirror();
        
        // Seed demo data on first visit
        const { seedDemoData } = await import('./db/demoData');
        await seedDemoData();
      } catch (err) {
        console.error("Initialization failed:", err);
      }
    };
    init();
  }, []);

  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Shell><Outlet /></Shell>}>
            <Route index element={<Home />} />
            <Route path="journal" element={<Journal />} />
            <Route path="profile" element={<Profile />} />
            <Route path="strategy" element={<Strategy />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;
