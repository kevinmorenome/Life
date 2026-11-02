// Talks to the Worker's /api/trakt routes; the Trakt tokens never reach the browser.

import { syncNow } from '../../lib/sync';

export interface TraktStatus {
  configured: boolean;
  connected: boolean;
  lastSync: number | null;
}

export async function traktStatus(): Promise<TraktStatus | null> {
  try {
    const res = await fetch('/api/trakt/status', { redirect: 'manual', credentials: 'same-origin' });
    if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return null;
    return (await res.json()) as TraktStatus;
  } catch {
    return null;
  }
}

/** Fetches new plays (the Worker works in batches, so keep asking while there's more), then pulls them in. */
export async function syncTrakt(): Promise<{ added: number } | { error: string }> {
  let added = 0;
  let page = 1;
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`/api/trakt/sync?page=${page}`, { method: 'POST', credentials: 'same-origin' });
    const body = (await res.json().catch(() => ({}))) as { added?: number; more?: boolean; page?: number; error?: string };
    if (!res.ok) return { error: body.error ?? `Server error ${res.status}` };
    added += body.added ?? 0;
    if (!body.more) break;
    page = (body.page ?? page) + 1;
  }
  await syncNow();
  return { added };
}

export async function disconnectTrakt(): Promise<void> {
  await fetch('/api/trakt/disconnect', { method: 'POST', credentials: 'same-origin' });
}

/** How long after a fetch before the next quiet one. A fetch with nothing new is a single request. */
export const REFRESH_AFTER_MS = 15 * 60_000;

/** Whether a quiet fetch is due: connected, and the last fetch is old enough (or there never was one). */
export function isDue(lastSync: number | null, now: number): boolean {
  return lastSync === null || now - lastSync >= REFRESH_AFTER_MS;
}

let fetching = false;

/** Fetches quietly if Trakt is connected and a fetch is due. Safe to call often. */
export async function autoSyncTrakt(): Promise<void> {
  if (fetching) return;
  fetching = true;
  try {
    const status = await traktStatus();
    if (status?.connected && isDue(status.lastSync, Date.now())) await syncTrakt();
  } finally {
    fetching = false;
  }
}

/** On start, whenever the app comes back to the foreground (a home-screen app isn't reloaded), and every few minutes while open. */
export function startTraktAutoSync(): void {
  void autoSyncTrakt();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void autoSyncTrakt();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void autoSyncTrakt();
  }, 5 * 60_000);
}
