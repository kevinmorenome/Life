// Talks to the Worker's /api/swarm routes; the Foursquare token never reaches the browser.

import { syncNow } from '../../lib/sync';

export interface SwarmStatus {
  configured: boolean;
  connected: boolean;
  lastSync: number | null;
}

export async function swarmStatus(): Promise<SwarmStatus | null> {
  try {
    const res = await fetch('/api/swarm/status', { redirect: 'manual', credentials: 'same-origin' });
    if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return null;
    return (await res.json()) as SwarmStatus;
  } catch {
    return null;
  }
}

/** Fetches new check-ins (the Worker works in batches, so keep asking while there's more), then pulls them in. */
export async function syncSwarm(): Promise<{ added: number } | { error: string }> {
  let added = 0;
  for (let i = 0; i < 50; i++) {
    const res = await fetch('/api/swarm/sync', { method: 'POST', credentials: 'same-origin' });
    const body = (await res.json().catch(() => ({}))) as { added?: number; more?: boolean; error?: string };
    if (!res.ok) return { error: body.error ?? `Server error ${res.status}` };
    added += body.added ?? 0;
    if (!body.more) break;
  }
  await syncNow();
  return { added };
}

export async function disconnectSwarm(): Promise<void> {
  await fetch('/api/swarm/disconnect', { method: 'POST', credentials: 'same-origin' });
}

/** How long after a fetch before the next quiet one. Foursquare allows ~500 requests an hour; a fetch with nothing new is one. */
export const REFRESH_AFTER_MS = 10 * 60_000;

/** Whether a quiet fetch is due: connected, and the last fetch is old enough (or there never was one). */
export function isDue(lastSync: number | null, now: number): boolean {
  return lastSync === null || now - lastSync >= REFRESH_AFTER_MS;
}

let fetching = false;

/** Fetches quietly if Swarm is connected and a fetch is due. Safe to call often. */
export async function autoSyncSwarm(): Promise<void> {
  if (fetching) return;
  fetching = true;
  try {
    const status = await swarmStatus();
    if (status?.connected && isDue(status.lastSync, Date.now())) await syncSwarm();
  } finally {
    fetching = false;
  }
}

/** On start, whenever the app comes back to the foreground (a home-screen app isn't reloaded), and every few minutes while open. */
export function startSwarmAutoSync(): void {
  void autoSyncSwarm();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void autoSyncSwarm();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void autoSyncSwarm();
  }, 5 * 60_000);
}
