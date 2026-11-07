import { useMemo, useState } from 'react';
import { DayWidget } from '../../DayWidget';
import { CheckIcon, LayersIcon, PinIcon, TrashIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import { allSelected, pruned, toggled, toggledAll } from '../watching/selection';
import type { TripitPlan } from '../../../worker/tripitTypes';
import { itineraryCheckins, matchKey } from '../trips/itineraryCheckins';
import { today } from '../../lib/format';
import { CheckinText, isUpcoming, nowTime, PlanText } from '../trips/placeRows';
import { CheckinActions } from './CheckinActions';
import { linkToPlan, mergeCheckins, moveCheckins, unlinkFromPlan } from './checkins';
import type { Checkin } from './types';

/**
 * The day screen's Places widget, built the same way as the trip's Itinerary (same rows, same folding): the TripIt plans of
 * the day, each with the Swarm check-in of the same place folded in, then the other Swarm check-ins. The check button in its header turns on
 * select mode: tick Swarm check-ins and move them all to another day (each keeps its time) or remove them, in the
 * app only.
 */
export function PlacesWidget({ date, done, plans }: { date: string; done: Checkin[]; plans: TripitPlan[] }) {
  const { save, remove } = useCollection<Checkin>('checkins');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(date);
  const swarmIds = useMemo(() => done.filter((c) => c.source === 'swarm').map((c) => c.id), [done]);
  // The plans of the day in the Itinerary's order, and what is left of the check-ins once the ones that are a plan are folded in.
  const dayPlans = useMemo(
    () =>
      plans
        .filter((p) => !p.removed && p.start <= date && p.end >= date)
        .sort((a, b) => a.start.localeCompare(b.start) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id.localeCompare(b.id)),
    [plans, date],
  );
  const { extra, matched } = useMemo(() => itineraryCheckins(dayPlans, done, date, date), [dayPlans, done, date]);
  const extras = extra.get(date) ?? [];
  const total = dayPlans.length + extras.length;
  const names = [...dayPlans.map((p) => p.title), ...extras.map((c) => c.venue)];

  // A plan with no check-in can be ticked too (as `plan:<id>`), to merge it with a Swarm check-in.
  const planTick = (planId: string) => `plan:${planId}`;
  const foldedIds = useMemo(() => new Set(dayPlans.map((p) => matched.get(matchKey(p, date))?.id).filter((id): id is string => !!id)), [dayPlans, matched, date]);
  const allIds = useMemo(() => [...done.map((c) => c.id), ...dayPlans.map((p) => planTick(p.id))], [done, dayPlans]);
  // Something that moved away or was removed (here or on another device) can't stay ticked.
  const ticked = useMemo(() => pruned(selected, allIds), [selected, allIds]);
  // Move and remove are for Swarm check-ins only.
  const onlySwarm = [...ticked].every((id) => swarmIds.includes(id));
  const pair = ticked.size === 2 ? done.filter((c) => ticked.has(c.id)) : [];
  const merged = pair.length === 2 ? mergeCheckins(pair[0], pair[1], new Date().toISOString()) : null;
  // One plan and one check-in that isn't part of a plan: merge them into one row.
  const planPick = ticked.size === 2 ? dayPlans.find((p) => ticked.has(planTick(p.id)) && !matched.has(matchKey(p, date))) : undefined;
  const checkinPick = planPick ? extras.find((c) => ticked.has(c.id)) : undefined;
  // One check-in that is part of a plan: take it out again.
  const foldedPick = ticked.size === 1 ? done.find((c) => ticked.has(c.id) && foldedIds.has(c.id)) : undefined;

  /** The select box or the edit / remove buttons of a Swarm check-in. */
  const checkinControls = (c: Checkin) =>
    selecting ? (
      <button type="button" className="shop-check" role="checkbox" aria-checked={ticked.has(c.id)} aria-label={`Select ${c.venue}`} onClick={() => setSelected(toggled(ticked, c.id))} />
    ) : (
      <CheckinActions checkin={c} />
    );

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function moveTicked() {
    const moved = moveCheckins(done, ticked, target, new Date().toISOString());
    await Promise.all(moved.map((c) => save(c)));
    stopSelecting();
  }

  async function mergeTicked() {
    if (!merged) return;
    await save(merged.keep);
    await remove(merged.drop.id);
    stopSelecting();
  }

  async function linkTicked() {
    if (!planPick || !checkinPick) return;
    await save(linkToPlan(checkinPick, planPick.id, new Date().toISOString()));
    stopSelecting();
  }

  async function separateTicked() {
    if (!foldedPick) return;
    await save(unlinkFromPlan(foldedPick, new Date().toISOString()));
    stopSelecting();
  }

  async function removeTicked() {
    const n = ticked.size;
    if (!confirm(`Remove ${n} ${n === 1 ? 'check-in' : 'check-ins'} from your check-ins here? They stay on Swarm.`)) return;
    await Promise.all([...ticked].map((id) => remove(id)));
    stopSelecting();
  }

  const selectButton =
    swarmIds.length > 0 && total > 0 && dayPlans.length + swarmIds.length > 1 ? (
      <button
        type="button"
        className="icon-btn"
        aria-label="Select check-ins"
        aria-pressed={selecting}
        onClick={() => {
          setTarget(date);
          if (selecting) stopSelecting();
          else setSelecting(true);
        }}
      >
        <CheckIcon />
      </button>
    ) : undefined;

  return (
    <DayWidget id="places" title="Places" icon={<PinIcon />} tone="place" size="full" badge={total > 1 ? total : undefined} summary={names.join(', ')} action={selectButton}>
      {selecting && (
        <div className="sticky-actions watch-select-bar checkin-select-bar">
          <span className="small">{ticked.size} selected</span>
          <button type="button" className="btn" onClick={() => setSelected(toggledAll(ticked, swarmIds))}>
            {allSelected(ticked, swarmIds) ? 'Clear' : `All (${swarmIds.length})`}
          </button>
          <input type="date" aria-label="Move to day" value={target} onChange={(e) => setTarget(e.target.value)} />
          <button type="button" className="btn btn-primary" disabled={ticked.size === 0 || !onlySwarm || !target || target === date} onClick={() => void moveTicked()}>
            Move
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={planPick ? 'Merge the plan and the check-in into one' : 'Merge the two selected into one'}
            disabled={planPick ? !checkinPick : !merged || merged.keep.source !== 'swarm'}
            onClick={() => void (planPick ? linkTicked() : mergeTicked())}
          >
            <LayersIcon />
          </button>
          {foldedPick && (
            <button type="button" className="btn" onClick={() => void separateTicked()}>
              Separate
            </button>
          )}
          <button type="button" className="icon-btn" aria-label={`Remove ${ticked.size} selected`} disabled={ticked.size === 0 || !onlySwarm} onClick={() => void removeTicked()}>
            <TrashIcon />
          </button>
          <button type="button" className="btn" onClick={stopSelecting}>
            Cancel
          </button>
        </div>
      )}
      <ul className="widget-list">
        {dayPlans.map((p) => {
          const here = matched.get(matchKey(p, date));
          return (
            <li key={p.id} className={['watch-day-play', isUpcoming(p, date, here, today(), nowTime()) ? 'is-upcoming' : '', selecting && here && ticked.has(here.id) ? 'is-selected' : ''].filter(Boolean).join(' ')}>
              <div className="pack-text checkin-info">
                <PlanText plan={p} day={date} here={here} />
                {here?.shout && <span className="small">{here.shout}</span>}
              </div>
              {here ? (
                checkinControls(here)
              ) : (
                selecting && (
                  <button type="button" className="shop-check" role="checkbox" aria-checked={ticked.has(planTick(p.id))} aria-label={`Select ${p.title}`} onClick={() => setSelected(toggled(ticked, planTick(p.id)))} />
                )
              )}
            </li>
          );
        })}
        {extras.map((c) => (
          <li key={c.id} className={['watch-day-play', selecting && ticked.has(c.id) ? 'is-selected' : ''].filter(Boolean).join(' ')}>
            <div className="pack-text checkin-info">
              <CheckinText checkin={c} shout />
            </div>
            {checkinControls(c)}
          </li>
        ))}
      </ul>
    </DayWidget>
  );
}
