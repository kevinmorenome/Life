import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startLongTaskLog } from './lib/perf';
import { PREVIEW_LABEL } from './lib/preview';
import { setAfterPull, startSync } from './lib/sync';
import { startSwarmAutoSync } from './modules/checkins/swarmClient';
import { startStatsfmAutoSync } from './modules/music/statsfmClient';
import { startTraktAutoSync } from './modules/watching/traktClient';
import { processInbox } from './modules/clothes/inboxRunner';
import './styles.css';

startLongTaskLog();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PR previews never write, so they must not consume requests meant for the real app.
if (!PREVIEW_LABEL) setAfterPull(processInbox);
void startSync();
if (!PREVIEW_LABEL) startSwarmAutoSync();
if (!PREVIEW_LABEL) startTraktAutoSync();
if (!PREVIEW_LABEL) startStatsfmAutoSync();
