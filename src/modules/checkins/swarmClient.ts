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

const HOUR = 3600_000;

/** On app start: if Swarm is connected and hasn't been fetched for an hour, fetch quietly. */
export async function autoSyncSwarm(): Promise<void> {
  const status = await swarmStatus();
  if (!status?.connected) return;
  if (status.lastSync && Date.now() - status.lastSync < HOUR) return;
  await syncSwarm();
}
