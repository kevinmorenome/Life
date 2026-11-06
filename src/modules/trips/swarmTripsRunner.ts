import { getAll, notify, put } from '../../lib/db';
import { today } from '../../lib/format';
import type { AppSettings } from '../../lib/settings';
import type { Checkin } from '../checkins/types';
import { newSwarmTrips } from './swarmTrips';
import type { Trip } from './types';

/** Makes trips for Swarm trips abroad that don't have one yet (see `newSwarmTrips`). Returns how many were added. */
export async function createTripsFromCheckins(): Promise<number> {
  const [checkins, trips, settings] = await Promise.all([getAll<Checkin>('checkins'), getAll<Trip>('trips'), getAll<AppSettings>('settings')]);
  const dismissed = settings.find((s) => s.id === 'app')?.swarmTripsDismissed ?? [];
  const fresh = newSwarmTrips(checkins, trips, dismissed, today(), new Date().toISOString());
  for (const t of fresh) await put('trips', t);
  if (fresh.length) notify('trips');
  return fresh.length;
}
