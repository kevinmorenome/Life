import { getAll, notify, put } from '../../lib/db';
import type { Plan } from '../clothes/types';
import { legacyPlans, tripsWithLegacyOutfits } from './tripPlans';
import type { Trip } from './types';

/**
 * Trips used to keep their own outfits (`Trip.outfitPlan`); now they are the calendar's plans. Turns what is left
 * into plans (the id is `<outfit>_<date>`, so every device making the same plan is one record) and then empties the
 * trip's copy. Plans first, so a crash in between just repeats harmlessly. Safe to call any time.
 */
export async function migrateTripPlans(): Promise<void> {
  const trips = tripsWithLegacyOutfits(await getAll<Trip>('trips'));
  if (trips.length === 0) return;
  const fresh = legacyPlans(trips, await getAll<Plan>('plans'));
  for (const p of fresh) await put('plans', p);
  const now = new Date().toISOString();
  for (const t of trips) await put('trips', { ...t, outfitPlan: {}, updatedAt: now });
  if (fresh.length) notify('plans');
  notify('trips');
}
