import { today } from '../../lib/format';
import { getAll, notify, put, remove } from '../../lib/db';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';
import { planCheckinChanges } from './planCheckins';

let lastSignature: string | undefined;

/**
 * Makes the check-ins for the itinerary plans (and drops the ones whose plan is gone). Safe to call any time. It reads
 * the whole check-ins store, so after the first run it only does so when the plans or the day changed, unless
 * `force` (after a check-in was moved or removed by hand, which can cover or uncover a plan).
 */
export async function syncPlanCheckins(force = false): Promise<void> {
  const plans = await getAll<TripitPlan>('tripitplans');
  const day = today();
  const signature = `${day}|${plans.map((p) => `${p.id}${p.removed ? '!' : ''}`).join(',')}`;
  if (!force && signature === lastSignature) return;
  const { add, remove: gone } = planCheckinChanges(plans, await getAll<Checkin>('checkins'), day);
  for (const c of add) await put('checkins', c);
  for (const id of gone) await remove('checkins', id);
  lastSignature = signature;
  if (add.length || gone.length) notify('checkins');
}
