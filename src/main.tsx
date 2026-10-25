import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PREVIEW_LABEL } from './lib/preview';
import { setAfterPull, startSync } from './lib/sync';
import { processInbox } from './modules/clothes/inboxRunner';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PR previews never write, so they must not consume requests meant for the real app.
if (!PREVIEW_LABEL) setAfterPull(processInbox);
void startSync();
