// Talks to the Worker's /api/tripit routes; the feed link is a Worker secret and never reaches the browser.

import { getAll, notify, put } from '../../lib/db';
import type { AppSettings } from '../../lib/settings';
import { syncNow } from '../../lib/sync';
import type { TripitPlan } from '../../../worker/tripitTypes';
import { newTrips } from './tripit';
import type { Trip } from './types';

export interface TripitStatus {
  /** Whether the Worker has the TRIPIT_FEED_URL secret. */
  configured: boolean;
  lastSync: number | null;
}

export async function tripitStatus(): Promise<TripitStatus | null> {
  try {
    const res = await fetch('/api/tripit/status', { redirect: 'manual', credentials: 'same-origin' });
    if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return null;
    return (await res.json()) as TripitStatus;
  } catch {
    return null;
  }
}

async function post(path: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch(`/api/tripit/${path}`, { method: 'POST', credentials: 'same-origin' });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return res.ok ? { ok: true, data } : { ok: false, error: typeof data.error === 'string' ? data.error : `Server error ${res.status}` };
}

/** Makes trips for plans that don't have one yet (see `newTrips`). Returns how many were added. */
export async function createTripsFromPlans(): Promise<number> {
  const [plans, trips, settings] = await Promise.all([getAll<TripitPlan>('tripitplans'), getAll<Trip>('trips'), getAll<AppSettings>('settings')]);
  const dismissed = settings.find((s) => s.id === 'app')?.tripitDismissed ?? [];
  const fresh = newTrips(plans, trips, dismissed, new Date().toISOString());
  for (const t of fresh) await put('trips', t);
  if (fresh.length) notify('trips');
  return fresh.length;
}

/** Fetches the feed, pulls the plans in, and makes trips for new ones. */
export async function syncTripit(): Promise<{ plans: number; trips: number } | { error: string }> {
  const res = await post('sync');
  if (!res.ok) return { error: res.error };
  await syncNow();
  const trips = await createTripsFromPlans();
  // New trips are local writes: send them up now rather than at the next change.
  if (trips > 0) await syncNow();
  return { plans: Number(res.data.plans ?? 0), trips };
}

/** How long after a fetch before the next quiet one. TripIt plans change rarely. */
export const REFRESH_AFTER_MS = 60 * 60_000;

export function isDue(lastSync: number | null, now: number): boolean {
  return lastSync === null || now - lastSync >= REFRESH_AFTER_MS;
}

let fetching = false;

/** Fetches quietly if TripIt is set up and a fetch is due. Safe to call often. */
export async function autoSyncTripit(): Promise<void> {
  if (fetching) return;
  fetching = true;
  try {
    const status = await tripitStatus();
    if (status?.configured && isDue(status.lastSync, Date.now())) await syncTripit();
  } finally {
    fetching = false;
  }
}

/** On start and whenever the app returns to the foreground (a home-screen app isn't reloaded). */
export function startTripitAutoSync(): void {
  void autoSyncTripit();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void autoSyncTripit();
  });
}
