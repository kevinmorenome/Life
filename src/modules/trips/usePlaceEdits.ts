import { notify } from '../../lib/db';
import { useCollection } from '../../lib/useCollection';
import type { TripitPlan } from '../../../worker/tripitTypes';
import { moveCheckin, moveCheckins, unlinkFromPlan } from '../checkins/checkins';
import type { Checkin } from '../checkins/types';
import { syncPlanCheckins } from './planCheckinsRunner';
import { mergeChanges, type PlaceRef } from './placeActions';

/** Everything you can do to a place row, the same from the day screen and from the Itinerary. App only: Swarm and TripIt are never touched. */
export function usePlaceEdits() {
  const checkins = useCollection<Checkin>('checkins');
  const plans = useCollection<TripitPlan>('tripitplans');
  const now = () => new Date().toISOString();
  // A collection only knows its own writes: tell the other screens that show these stores (the calendar, the day screen, the Itinerary) to reload.
  const done = async (store: 'checkins' | 'tripitplans', work: () => Promise<unknown>) => {
    await work();
    notify(store);
  };
  return {
    /** Change the day and time of a check-in (`time` '' = no time). */
    changeWhen: async (c: Checkin, date: string, time: string) => {
      const moved = moveCheckin(c, date, time, now());
      if (moved !== c) await done('checkins', () => checkins.save(moved));
    },
    merge: async (a: PlaceRef, b: PlaceRef) => {
      const changes = mergeChanges(a, b, now());
      if (!changes) return;
      await done('checkins', async () => {
        for (const c of changes.save) await checkins.save(c);
        for (const id of changes.remove) await checkins.remove(id);
      });
    },
    separate: (c: Checkin) => done('checkins', () => checkins.save(unlinkFromPlan(c, now()))),
    removeCheckin: (c: Checkin) => done('checkins', () => checkins.remove(c.id)),
    restoreCheckin: (c: Checkin) => done('checkins', () => checkins.save(c)),
    /** Several check-ins to one day, each keeping its time. */
    moveMany: async (all: Checkin[], ids: ReadonlySet<string>, date: string) => {
      await done('checkins', async () => {
        for (const c of moveCheckins(all, ids, date, now())) await checkins.save(c);
      });
    },
    removeMany: async (ids: Iterable<string>) => {
      await done('checkins', async () => {
        for (const id of ids) await checkins.remove(id);
      });
    },
    /** A plan that is wrong, or one you never did: it then counts for nothing anywhere (see TripitPlan.removed). */
    removePlan: async (p: TripitPlan) => {
      await done('tripitplans', () => plans.save({ ...p, removed: true }));
      await syncPlanCheckins();
    },
    restorePlan: async (p: TripitPlan) => {
      const { removed: _removed, ...rest } = p;
      await done('tripitplans', () => plans.save(rest));
      await syncPlanCheckins();
    },
  };
}

export type PlaceEdits = ReturnType<typeof usePlaceEdits>;
