import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/editor.css';
import './styles/quiz.css';
import { App } from './app/App';
import { paintMirroredTheme } from './app/SettingsContext';
import { initServiceWorker } from './app/runtime';

paintMirroredTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initServiceWorker();
