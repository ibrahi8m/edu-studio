import { useCallback, useState } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Splash } from "../components/Splash";
import { About } from "../pages/About";
import { MePage } from "../pages/Me";
import { AiStudioPage } from "../pages/AiStudio";
import { PROJECT_INFO } from "./project";
import { AmbientBackground } from "./AmbientBackground";
import { AudioSync } from "../audio/AudioControl";
import { LibraryPage } from "../pages/Library";
import { TransferPage } from "../pages/Transfer";
import { Dashboard } from "../pages/Dashboard";
import { More } from "../pages/More";
import { BuilderPage } from "../pages/Builder";
import { LessonEditorPage } from "../pages/LessonEditor";
import { LessonPreview } from "../pages/LessonPreview";
import { ProjectDetail } from "../pages/ProjectDetail";
import { ProjectsPage } from "../pages/Projects";
import { AttemptDetail, QuizResults, ResultsHome } from "../pages/Results";
import { QuizEditorPage } from "../pages/QuizEditor";
import { QuizzesPage } from "../pages/Quizzes";
import { SettingsPage } from "../pages/Settings";
import { LearnHome } from "../pages/learn/LearnHome";
import { LessonPlayer } from "../pages/learn/LessonPlayer";
import { StudentLayout } from "../student/StudentLayout";
import { StudentReport } from "../pages/StudentReport";
import { StudioPage } from "../pages/Studio";
import { DesignEditorPage } from "../pages/DesignEditor";
import { TakeQuiz } from "../pages/TakeQuiz";
import { ToastProvider } from "./Toasts";
import { SettingsProvider, useSettings } from "./SettingsContext";
import {
  LoginPage,
  RecoverPage, ResetPasswordPage, LocalSignUpPage,
  RequireAuth,
  SetupPage,
  SignUpPage,
} from "../auth/AuthPages";
import { AccountPage, UsersPage } from "../auth/UsersPages";

function Root() {
  const { settings, ready } = useSettings();
  const [splashDone, setSplashDone] = useState(false);
  const done = useCallback(() => setSplashDone(true), []);
  // The splash shows at launch; once settings load it is skipped if disabled.
  const showSplash = !splashDone && (!ready || settings.showSplash);

  return (
    <>
      <AudioSync />
      <HashRouter>
        <AmbientBackground />
        <Routes>
          {/* 1.5.0: sign-in screens are the only pages open without an account */}
          <Route path="login" element={<LoginPage />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="recover" element={<RecoverPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="signup" element={<SignUpPage />} />
          <Route path="local-signup" element={<LocalSignUpPage />} />
          <Route
            element={
              <RequireAuth>
                <Outlet />
              </RequireAuth>
            }
          >
            {/* Student preview: full screen, outside the app shell */}
            <Route path="preview/:lessonId" element={<LessonPreview />} />
            {/* Student taking a quiz: full screen, outside the app shell */}
            <Route path="take/:quizId" element={<TakeQuiz />} />
            {/* Student mode: its own frame, no teacher navigation or tools */}
            <Route path="learn" element={<StudentLayout />}>
              <Route index element={<LearnHome />} />
              <Route path="lesson/:lessonId" element={<LessonPlayer />} />
            </Route>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route
                path="projects/:id/lessons/:lessonId"
                element={<LessonEditorPage />}
              />
              <Route path="builder" element={<BuilderPage />} />
              <Route path="studio" element={<StudioPage />} />
              <Route path="studio/:designId" element={<DesignEditorPage />} />
              <Route path="quizzes" element={<QuizzesPage />} />
              <Route path="quizzes/:quizId" element={<QuizEditorPage />} />
              <Route
                path="student"
                element={<Navigate to="/learn" replace />}
              />
              <Route
                path="results/students/:studentKey"
                element={<StudentReport />}
              />
              <Route path="results" element={<ResultsHome />} />
              <Route path="results/:quizId" element={<QuizResults />} />
              <Route
                path="results/:quizId/:attemptId"
                element={<AttemptDetail />}
              />
              <Route path="library" element={<LibraryPage />} />
              <Route path="backup" element={<TransferPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="about" element={<About />} />
              <Route path="me" element={<MePage />} />
              <Route path="ai-studio" element={<AiStudioPage />} />
              <Route path="more" element={<More />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
      {showSplash && <Splash onDone={done} ownerName={PROJECT_INFO.owner} />}
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
