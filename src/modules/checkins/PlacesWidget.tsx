import { useMemo, useState } from 'react';
import { DayWidget } from '../../DayWidget';
import { CheckIcon, PinIcon, TrashIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import { allSelected, pruned, toggled, toggledAll } from '../watching/selection';
import type { Draft } from '../trips/planCheckins';
import { CheckinActions } from './CheckinActions';
import { moveCheckins, place } from './checkins';
import type { Checkin } from './types';

/**
 * The day screen's Places widget: the day's check-ins and planned places. The check button in its header turns on
 * select mode: tick Swarm check-ins and move them all to another day (each keeps its time) or remove them, in the
 * app only.
 */
export function PlacesWidget({ date, done, planned }: { date: string; done: Checkin[]; planned: Draft[] }) {
  const { save, remove } = useCollection<Checkin>('checkins');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(date);
  const swarmIds = useMemo(() => done.filter((c) => c.source === 'swarm').map((c) => c.id), [done]);
  // A check-in that moved away or was removed (here or on another device) can't stay ticked.
  const ticked = useMemo(() => pruned(selected, swarmIds), [selected, swarmIds]);
  const total = done.length + planned.length;
  const names = [...done.map((c) => c.venue), ...planned.map((d) => d.venue)];

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function moveTicked() {
    const moved = moveCheckins(done, ticked, target, new Date().toISOString());
    await Promise.all(moved.map((c) => save(c)));
    stopSelecting();
  }

  async function removeTicked() {
    const n = ticked.size;
    if (!confirm(`Remove ${n} ${n === 1 ? 'check-in' : 'check-ins'} from your check-ins here? They stay on Swarm.`)) return;
    await Promise.all([...ticked].map((id) => remove(id)));
    stopSelecting();
  }

  const selectButton =
    swarmIds.length > 1 ? (
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
          <button type="button" className="btn btn-primary" disabled={ticked.size === 0 || !target || target === date} onClick={() => void moveTicked()}>
            Move
          </button>
          <button type="button" className="icon-btn" aria-label={`Remove ${ticked.size} selected`} disabled={ticked.size === 0} onClick={() => void removeTicked()}>
            <TrashIcon />
          </button>
          <button type="button" className="btn" onClick={stopSelecting}>
            Cancel
          </button>
        </div>
      )}
      <ul className="widget-list">
        {done.map((c) => {
          const on = ticked.has(c.id);
          return (
            <li key={c.id} className={[c.source === 'swarm' ? 'watch-day-play' : '', selecting && on ? 'is-selected' : ''].filter(Boolean).join(' ') || undefined}>
              {c.source === 'swarm' ? (
                <>
                  <div className="checkin-info">
                    <strong>{c.venue}</strong>
                    <div className="muted small">{[c.time, place(c)].filter(Boolean).join(' · ')}</div>
                    {c.shout && <div className="small">{c.shout}</div>}
                  </div>
                  {selecting ? (
                    <button type="button" className="shop-check" role="checkbox" aria-checked={on} aria-label={`Select ${c.venue}`} onClick={() => setSelected(toggled(ticked, c.id))} />
                  ) : (
                    <CheckinActions checkin={c} />
                  )}
                </>
              ) : (
                <>
                  <strong>{c.venue}</strong>
                  <span className="muted small">{[c.time, place(c)].filter(Boolean).join(' · ')}</span>
                  {c.shout && <span className="small">{c.shout}</span>}
                </>
              )}
            </li>
          );
        })}
        {planned.map((d) => (
          <li key={d.id} className="planned">
            <strong>{d.venue}</strong>
            <span className="muted small">{[d.time, place(d)].filter(Boolean).join(' · ')}</span>
            <span className="planned-tag muted small">Planned</span>
          </li>
        ))}
      </ul>
    </DayWidget>
  );
}
