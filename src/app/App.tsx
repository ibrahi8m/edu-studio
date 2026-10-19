import { useCallback, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Splash } from '../components/Splash';
import { About } from '../pages/About';
import { ComingSoon } from '../pages/ComingSoon';
import { Dashboard } from '../pages/Dashboard';
import { More } from '../pages/More';
import { ProjectDetail } from '../pages/ProjectDetail';
import { ProjectsPage } from '../pages/Projects';
import { SettingsPage } from '../pages/Settings';
import { ToastProvider } from './Toasts';
import { SettingsProvider, useSettings } from './SettingsContext';

const PLANNED_ROUTES = ['/builder', '/studio', '/quizzes', '/student', '/results', '/library', '/backup'];

function Root() {
  const { settings, ready } = useSettings();
  const [splashDone, setSplashDone] = useState(false);
  const done = useCallback(() => setSplashDone(true), []);
  // The splash shows at launch; once settings load it is skipped if disabled.
  const showSplash = !splashDone && (!ready || settings.showSplash);

  return (
    <>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            {PLANNED_ROUTES.map((p) => (
              <Route key={p} path={p.slice(1)} element={<ComingSoon path={p} />} />
            ))}
            <Route path="settings" element={<SettingsPage />} />
            <Route path="about" element={<About />} />
            <Route path="more" element={<More />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      {showSplash && <Splash onDone={done} ownerName={settings.ownerName} />}
    </>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </SettingsProvider>
  );
}
