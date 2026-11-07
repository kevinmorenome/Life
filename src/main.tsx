import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startLongTaskLog } from './lib/perf';
import { PREVIEW_LABEL } from './lib/preview';
import { setAfterPull, startSync } from './lib/sync';
import { startSwarmAutoSync } from './modules/checkins/swarmClient';
import { startStatsfmAutoSync } from './modules/music/statsfmClient';
import { startTripitAutoSync } from './modules/trips/tripitClient';
import { startTraktAutoSync } from './modules/watching/traktClient';
import { processInbox } from './modules/clothes/inboxRunner';
import { migrateTripPlans } from './modules/trips/migratePlans';
import './styles.css';

startLongTaskLog();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PR previews never write, so they must not consume requests meant for the real app.
// Trips used to keep their own outfits; they are the calendar's plans now (see migrateTripPlans).
if (!PREVIEW_LABEL) {
  setAfterPull(async () => {
    await processInbox();
    await migrateTripPlans();
  });
  void migrateTripPlans();
}
void startSync();
if (!PREVIEW_LABEL) startSwarmAutoSync();
if (!PREVIEW_LABEL) startTraktAutoSync();
if (!PREVIEW_LABEL) startStatsfmAutoSync();
if (!PREVIEW_LABEL) startTripitAutoSync();
