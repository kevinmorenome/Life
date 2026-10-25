// Background sync between this browser's IndexedDB and the Worker API.
// The app always reads and writes locally (so it works offline); this pushes
// queued local changes, then pulls everything new from the server.

import { MAX_PUSH, type PullResponse } from '../../worker/protocol';
import { applyRemote, clearOutbox, getMeta, getOutbox, onLocalWrite, queueAll, setMeta } from './db';
import { PREVIEW_LABEL } from './preview';

export type SyncState =
  | 'idle' // not started yet
  | 'syncing'
  | 'synced'
  | 'offline' // network unreachable; will retry
  | 'signed-out' // Cloudflare Access session expired
  | 'not-configured' // server is up but Access isn't set up yet
  | 'local-only' // no sync server (e.g. `npm run dev`)
  | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSynced?: number;
  pending: number;
  message?: string;
}

const CURSOR = 'syncCursor';
const SEEDED = 'syncSeeded';
const LAST_SYNCED = 'lastSynced';

class SyncError extends Error {
  constructor(
    public state: SyncState,
    message: string,
  ) {
    super(message);
  }
}

let status: SyncStatus = { state: 'idle', pending: 0 };
const subscribers = new Set<(s: SyncStatus) => void>();

export function getStatus(): SyncStatus {
  return status;
}

export function subscribe(fn: (s: SyncStatus) => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  subscribers.forEach((fn) => fn(status));
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    // Access redirects expired sessions to its login page; don't follow that.
    res = await fetch(path, { ...init, redirect: 'manual', credentials: 'same-origin' });
  } catch {
    throw new SyncError('offline', 'Can’t reach the server');
  }
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
    throw new SyncError('signed-out', 'Sign in again to sync');
  }
  const isJson = res.headers.get('Content-Type')?.includes('application/json');
  if (!isJson) throw new SyncError('local-only', 'No sync server');
  if (res.status === 503) throw new SyncError('not-configured', (await res.json()).error);
  if (!res.ok) throw new SyncError('error', `Server error ${res.status}`);
  return res;
}

let afterPull: (() => Promise<void>) | null = null;
/**
 * Registers work to run after each pull, e.g. applying requests other clients
 * queued. Its writes are pushed by the next sync, which they schedule.
 */
export function setAfterPull(fn: (() => Promise<void>) | null): void {
  afterPull = fn;
}

async function runOnce(): Promise<void> {
  if (!PREVIEW_LABEL && !(await getMeta<boolean>(SEEDED))) {
    // First connection from this browser: upload what's already stored locally.
    await queueAll();
    await setMeta(SEEDED, true);
  }

  // Push (never from a PR preview: changes there stay on this device)
  let outbox = PREVIEW_LABEL ? [] : await getOutbox();
  setStatus({ pending: outbox.length });
  while (outbox.length) {
    const batch = outbox.slice(0, MAX_PUSH);
    await api('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: batch.map(({ key: _key, ...c }) => c) }),
    });
    await clearOutbox(batch);
    outbox = outbox.slice(MAX_PUSH);
    setStatus({ pending: outbox.length });
  }

  // Pull
  let cursor = (await getMeta<number>(CURSOR)) ?? 0;
  for (;;) {
    const res = await api(`/api/sync/pull?since=${cursor}`);
    const page = (await res.json()) as PullResponse;
    await applyRemote(page.changes);
    cursor = page.cursor;
    await setMeta(CURSOR, cursor);
    if (!page.more) break;
  }

  try {
    await afterPull?.();
  } catch (e) {
    console.error('Post-sync step failed', e);
  }

  const now = Date.now();
  await setMeta(LAST_SYNCED, now);
  setStatus({ pending: (await getOutbox()).length, lastSynced: now });
}

let running: Promise<void> | null = null;
let again = false;

/** Runs a sync now, or schedules one right after the sync in progress. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      setStatus({ state: 'syncing', message: undefined });
      try {
        await runOnce();
        setStatus({ state: 'synced' });
      } catch (e) {
        const err = e instanceof SyncError ? e : new SyncError('error', String(e));
        setStatus({ state: err.state, message: err.message });
        again = false;
      }
    } while (again);
    running = null;
  })();
  return running;
}

let debounce: ReturnType<typeof setTimeout> | undefined;
function scheduleSoon(): void {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (status.state !== 'local-only') void syncNow();
  }, 800);
}

/** Starts background sync for the app's lifetime. */
export async function startSync(): Promise<void> {
  setStatus({ lastSynced: await getMeta<number>(LAST_SYNCED), pending: (await getOutbox()).length });
  onLocalWrite(() => {
    getOutbox().then((o) => setStatus({ pending: o.length }));
    scheduleSoon();
  });
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && status.state !== 'local-only') void syncNow();
  }, 60_000);
  await syncNow();
}
