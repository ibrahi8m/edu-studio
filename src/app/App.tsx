import { useCallback, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Splash } from '../components/Splash';
import { About } from '../pages/About';
import { ComingSoon } from '../pages/ComingSoon';
import { Dashboard } from '../pages/Dashboard';
import { More } from '../pages/More';
import { BuilderPage } from '../pages/Builder';
import { LessonEditorPage } from '../pages/LessonEditor';
import { LessonPreview } from '../pages/LessonPreview';
import { ProjectDetail } from '../pages/ProjectDetail';
import { ProjectsPage } from '../pages/Projects';
import { AttemptDetail, QuizResults, ResultsHome } from '../pages/Results';
import { QuizEditorPage } from '../pages/QuizEditor';
import { QuizzesPage } from '../pages/Quizzes';
import { SettingsPage } from '../pages/Settings';
import { StudentHome } from '../pages/StudentHome';
import { TakeQuiz } from '../pages/TakeQuiz';
import { ToastProvider } from './Toasts';
import { SettingsProvider, useSettings } from './SettingsContext';

const PLANNED_ROUTES = ['/studio', '/library', '/backup'];

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
          {/* Student preview: full screen, outside the app shell */}
          <Route path="preview/:lessonId" element={<LessonPreview />} />
          {/* Student taking a quiz: full screen, outside the app shell */}
          <Route path="take/:quizId" element={<TakeQuiz />} />
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="projects/:id/lessons/:lessonId" element={<LessonEditorPage />} />
            <Route path="builder" element={<BuilderPage />} />
            <Route path="quizzes" element={<QuizzesPage />} />
            <Route path="quizzes/:quizId" element={<QuizEditorPage />} />
            <Route path="student" element={<StudentHome />} />
            <Route path="results" element={<ResultsHome />} />
            <Route path="results/:quizId" element={<QuizResults />} />
            <Route path="results/:quizId/:attemptId" element={<AttemptDetail />} />
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
