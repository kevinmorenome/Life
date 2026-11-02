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

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  /** Seconds the code stays valid. */
  expiresIn: number;
  /** Seconds to wait between polls. */
  interval: number;
}

export async function startDevice(): Promise<DeviceCode | { error: string }> {
  try {
    const res = await fetch('/api/trakt/device/start', { method: 'POST', credentials: 'same-origin' });
    const body = (await res.json().catch(() => ({}))) as Partial<DeviceCode> & { error?: string };
    if (!res.ok || !body.deviceCode) return { error: body.error ?? `Server error ${res.status}` };
    return body as DeviceCode;
  } catch {
    return { error: 'Could not reach the server' };
  }
}

export type PollStatus = 'pending' | 'slow_down' | 'ok' | 'expired' | 'denied' | 'error';

export async function pollDevice(deviceCode: string): Promise<PollStatus> {
  try {
    const res = await fetch('/api/trakt/device/poll', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });
    if (!res.ok) return 'error';
    return ((await res.json()) as { status: PollStatus }).status;
  } catch {
    // A dropped request while waiting is not the end of the attempt.
    return 'pending';
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
