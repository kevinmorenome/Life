// Talks to the Worker's /api/statsfm routes. stats.fm needs no sign-in (the profile just has to be public),
// so the only thing stored is your custom ID, in the synced settings.

import { getAll } from '../../lib/db';
import { syncNow } from '../../lib/sync';
import type { AppSettings } from '../../lib/settings';
import { syncFrom } from './music';
import type { MusicDay } from './types';

export interface StatsfmProfile {
  name: string;
  timezone: string;
  plus: boolean;
}

export async function statsfmProfile(user: string): Promise<StatsfmProfile | { error: string }> {
  try {
    const res = await fetch(`/api/statsfm/profile?user=${encodeURIComponent(user)}`, { redirect: 'manual', credentials: 'same-origin' });
    const body = (await res.json().catch(() => ({}))) as Partial<StatsfmProfile> & { error?: string };
    if (!res.ok || !body.name) return { error: body.error ?? `Server error ${res.status}` };
    return { name: body.name, timezone: body.timezone ?? 'UTC', plus: Boolean(body.plus) };
  } catch {
    return { error: 'Could not reach the server' };
  }
}

const LAST_KEY = 'life.statsfm.lastSync';

/** Fetches new listening days (the Worker works in batches of ~10,000 plays, so keep asking while there's more), then pulls them in. */
export async function syncStatsfm(user: string, onProgress?: (through: string) => void): Promise<{ days: number } | { error: string }> {
  let from = syncFrom(await getAll<MusicDay>('musicdays'));
  let days = 0;
  for (let i = 0; i < 200; i++) {
    let res: Response;
    try {
      res = await fetch('/api/statsfm/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, from }),
      });
    } catch {
      return { error: 'Could not reach the server' };
    }
    const body = (await res.json().catch(() => ({}))) as { days?: number; next?: string | null; newest?: string | null; error?: string };
    if (!res.ok) return { error: body.error ?? `Server error ${res.status}` };
    days += body.days ?? 0;
    if (body.newest) onProgress?.(body.newest);
    if (!body.next || body.next === from) break;
    from = body.next;
  }
  try {
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {
    // No storage: the next start just fetches again.
  }
  await syncNow();
  return { days };
}

/** How long after a fetch before the next quiet one. A fetch with nothing new is a single small request. */
export const REFRESH_AFTER_MS = 15 * 60_000;

export function isDue(lastSync: number | null, now: number): boolean {
  return lastSync === null || now - lastSync >= REFRESH_AFTER_MS;
}

let fetching = false;

/** Fetches quietly if a stats.fm ID is set and a fetch is due. Safe to call often. */
export async function autoSyncStatsfm(): Promise<void> {
  if (fetching) return;
  fetching = true;
  try {
    const user = (await getAll<AppSettings>('settings')).find((s) => s.id === 'app')?.statsfmUser;
    if (!user) return;
    let last: number | null = null;
    try {
      last = Number(localStorage.getItem(LAST_KEY)) || null;
    } catch {
      // Treated as never fetched.
    }
    if (isDue(last, Date.now())) await syncStatsfm(user);
  } finally {
    fetching = false;
  }
}

/** On start, whenever the app comes back to the foreground, and every few minutes while open. */
export function startStatsfmAutoSync(): void {
  void autoSyncStatsfm();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void autoSyncStatsfm();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void autoSyncStatsfm();
  }, 5 * 60_000);
}
