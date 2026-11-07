import { getAll, notify, put, remove } from '../../lib/db';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';
import { planCheckinChanges } from './planCheckins';

/** Makes the check-ins for the itinerary plans (and drops the ones whose plan is gone). Safe to call any time. */
export async function syncPlanCheckins(): Promise<void> {
  const { add, remove: gone } = planCheckinChanges(await getAll<TripitPlan>('tripitplans'), await getAll<Checkin>('checkins'));
  for (const c of add) await put('checkins', c);
  for (const id of gone) await remove('checkins', id);
  if (add.length || gone.length) notify('checkins');
}
