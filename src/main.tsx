import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/editor.css';
import './styles/quiz.css';
import './styles/student.css';
import './styles/studio.css';
import './styles/library.css';
import './styles/v11.css';
import './styles/v12.css';
import './styles/v15.css';
import { App } from './app/App';
import { paintMirroredTheme } from './app/SettingsContext';
import { initServiceWorker } from './app/runtime';
import { installAndroidBridge } from './app/androidBridge';
import { db } from './db/db';
import { updateProject } from './db/projects';
import { captureRecoveryLink } from './auth/cloud';

// 1.5.2: a Supabase password-recovery link opens «كلمة مرور جديدة» (before the router reads the address)
const onRecoveryLink = () => {
  if (!captureRecoveryLink()) return;
  try {
    localStorage.setItem('ibrahi8m.auth-mode', 'cloud');
  } catch {
    /* ignore */
  }
};
onRecoveryLink();
// also when the link is opened in a tab where the app is already running: «popstate» fires first and this listener is
// registered before the router's, so the router already reads «#/reset-password»; «hashchange» is the fallback.
window.addEventListener('popstate', onRecoveryLink);
window.addEventListener('hashchange', () => {
  if (captureRecoveryLink()) window.dispatchEvent(new PopStateEvent('popstate'));
});
paintMirroredTheme();
installAndroidBridge();
// 1.5.0: the same data functions the screens use, reachable for automated checks that a direct call
// (not only a hidden button) is refused without the right account. They grant nothing by themselves.
(window as unknown as { __ibrahi8mTest: unknown }).__ibrahi8mTest = {
  updateProject: (id: string, patch: Parameters<typeof updateProject>[2]) => updateProject(db, id, patch),
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initServiceWorker();
