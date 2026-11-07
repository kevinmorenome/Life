import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarIcon, CheckIcon, LayersIcon, TrashIcon, UndoIcon } from '../../icons';
import { today } from '../../lib/format';
import { allSelected, pruned, toggled, toggledAll } from '../watching/selection';
import { SourceLogos } from '../checkins/SourceLogo';
import { place } from '../checkins/checkins';
import type { Checkin } from '../checkins/types';
import { candidatesFor, checkinOf, refKey, type PlaceRef } from './placeActions';
import { CheckinText, isUpcoming, nowTime, PlanText, planMeta } from './placeRows';
import { usePlaceEdits } from './usePlaceEdits';

type Mode = 'menu' | 'when' | 'merge';
interface Toast {
  text: string;
  undo: () => Promise<void> | void;
}

const refTitle = (r: PlaceRef) => (r.kind === 'plan' ? r.plan.title : r.checkin.venue);
const refLine = (r: PlaceRef) => (r.kind === 'plan' ? planMeta(r.plan, r.day, r.here) : [r.checkin.time, place(r.checkin)].filter(Boolean).join(' · '));

/**
 * What you can do to a place, the same on the day screen and in the trip's Itinerary: tap a row and a sheet offers the
 * actions that make sense for it (change day or time, merge, separate, remove, select several). Nothing shows on the rows
 * until then. Returns `row` (renders one row), `bar` (the bar of select mode, put it above the list) and `sheet` (put it
 * anywhere in the screen).
 */
export function usePlaceUi(dayRows: Map<string, PlaceRef[]>) {
  const edits = usePlaceEdits();
  const [open, setOpen] = useState<PlaceRef | null>(null);
  const [mode, setMode] = useState<Mode>('menu');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  const allCheckins = useMemo(() => [...dayRows.values()].flat().map(checkinOf).filter((c): c is Checkin => !!c), [dayRows]);
  const allIds = useMemo(() => allCheckins.map((c) => c.id), [allCheckins]);
  // A check-in that moved away or was removed (here or on another device) can't stay ticked.
  const ticked = useMemo(() => pruned(selected, allIds), [selected, allIds]);

  // The Undo toast goes away by itself.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  function close() {
    setOpen(null);
    setMode('menu');
  }
  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  function row(r: PlaceRef, opts: { key?: string } = {}): ReactNode {
    const ck = checkinOf(r);
    const upcoming = r.kind === 'plan' && isUpcoming(r.plan, r.day, r.here, today(), nowTime());
    const on = !!ck && ticked.has(ck.id);
    return (
      <li key={opts.key ?? refKey(r)} className={['place-row', upcoming ? 'is-upcoming' : '', selecting && on ? 'is-selected' : ''].filter(Boolean).join(' ')}>
        <button
          type="button"
          className="place-main pack-text"
          onClick={() => {
            if (selecting) {
              if (ck) setSelected(toggled(ticked, ck.id));
              return;
            }
            setMode('menu');
            setOpen(r);
          }}
        >
          {r.kind === 'plan' ? (
            <>
              <PlanText plan={r.plan} day={r.day} here={r.here} />
              {r.here?.shout && <span className="small">{r.here.shout}</span>}
            </>
          ) : (
            <CheckinText checkin={r.checkin} shout />
          )}
        </button>
        {selecting && ck && <button type="button" className="shop-check" role="checkbox" aria-checked={on} aria-label={`Select ${refTitle(r)}`} onClick={() => setSelected(toggled(ticked, ck.id))} />}
      </li>
    );
  }

  const bar = selecting ? (
    <div className="sticky-actions watch-select-bar checkin-select-bar">
      <span className="small">{ticked.size} selected</span>
      <button type="button" className="btn" onClick={() => setSelected(toggledAll(ticked, allIds))}>
        {allSelected(ticked, allIds) ? 'Clear' : `All (${allIds.length})`}
      </button>
      <input type="date" aria-label="Move to day" value={target} onChange={(e) => setTarget(e.target.value)} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={ticked.size === 0 || !target}
        onClick={async () => {
          await edits.moveMany(allCheckins, ticked, target);
          stopSelecting();
        }}
      >
        Move
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Remove ${ticked.size} selected`}
        disabled={ticked.size === 0}
        onClick={async () => {
          const n = ticked.size;
          if (!confirm(`Remove ${n} ${n === 1 ? 'check-in' : 'check-ins'} from your check-ins here? They stay on Swarm.`)) return;
          await edits.removeMany(ticked);
          stopSelecting();
        }}
      >
        <TrashIcon />
      </button>
      <button type="button" className="btn" onClick={stopSelecting}>
        Cancel
      </button>
    </div>
  ) : null;

  const sheet = (
    <>
      {open && (
        <PlaceSheet
          row={open}
          mode={mode}
          setMode={setMode}
          candidates={candidatesFor(open, dayRows.get(open.day) ?? [])}
          onClose={close}
          onWhen={async (c, date, time) => {
            await edits.changeWhen(c, date, time);
            close();
          }}
          onMerge={async (other) => {
            await edits.merge(open, other);
            close();
          }}
          onSeparate={async (c) => {
            await edits.separate(c);
            close();
          }}
          onRemoveCheckin={async (c) => {
            await edits.removeCheckin(c);
            close();
            setToast({ text: `Removed ${c.venue}`, undo: () => edits.restoreCheckin(c) });
          }}
          onRemovePlan={async (r) => {
            if (r.kind !== 'plan') return;
            await edits.removePlan(r.plan);
            close();
            setToast({ text: `Removed ${r.plan.title}`, undo: () => edits.restorePlan(r.plan) });
          }}
          onSelect={(c) => {
            close();
            setSelecting(true);
            setTarget('');
            setSelected(new Set([c.id]));
          }}
        />
      )}
      {toast && (
        <div className="food-toast" role="status">
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={async () => {
              await toast.undo();
              setToast(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </>
  );

  return { row, bar, sheet, selecting, edits };
}

function PlaceSheet({
  row,
  mode,
  setMode,
  candidates,
  onClose,
  onWhen,
  onMerge,
  onSeparate,
  onRemoveCheckin,
  onRemovePlan,
  onSelect,
}: {
  row: PlaceRef;
  mode: Mode;
  setMode(m: Mode): void;
  candidates: PlaceRef[];
  onClose(): void;
  onWhen(c: Checkin, date: string, time: string): void;
  onMerge(other: PlaceRef): void;
  onSeparate(c: Checkin): void;
  onRemoveCheckin(c: Checkin): void;
  onRemovePlan(r: PlaceRef): void;
  onSelect(c: Checkin): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ck = checkinOf(row);
  const [date, setDate] = useState(ck?.date ?? '');
  const [time, setTime] = useState(ck?.time ?? '');
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const merged = row.kind === 'plan' && !!row.here;
  return (
    <>
      <button type="button" className="food-scrim" aria-label="Close" onClick={onClose} />
      <div className="food-sheet place-sheet" role="dialog" aria-modal="true" aria-label={refTitle(row)} tabIndex={-1} ref={box}>
        <div className="food-grip" aria-hidden />
        <div className="food-sheet-text">
          <h2>{refTitle(row)}</h2>
          <p className="muted small">
            {refLine(row)} <SourceLogos sources={row.kind === 'plan' ? (row.here ? ['tripit', 'swarm'] : ['tripit']) : ['swarm']} />
          </p>
        </div>

        {mode === 'menu' && (
          <div className="food-actions">
            {ck && (
              <button type="button" className="food-action" onClick={() => setMode('when')}>
                <CalendarIcon />
                Change day or time
              </button>
            )}
            {candidates.length > 0 && (
              <button type="button" className="food-action" onClick={() => setMode('merge')}>
                <LayersIcon />
                Merge with…
              </button>
            )}
            {merged && ck && (
              <button type="button" className="food-action" onClick={() => onSeparate(ck)}>
                <UndoIcon />
                Separate
              </button>
            )}
            {ck && (
              <button type="button" className="food-action" onClick={() => onSelect(ck)}>
                <CheckIcon />
                Select several
              </button>
            )}
            {ck && (
              <button type="button" className="food-action food-action-danger" onClick={() => onRemoveCheckin(ck)}>
                <TrashIcon />
                Remove check-in
              </button>
            )}
            {row.kind === 'plan' && (
              <button type="button" className="food-action food-action-danger" onClick={() => onRemovePlan(row)}>
                <TrashIcon />
                Remove plan
              </button>
            )}
          </div>
        )}

        {mode === 'when' && ck && (
          <form
            className="place-when"
            onSubmit={(e) => {
              e.preventDefault();
              onWhen(ck, date, time);
            }}
          >
            <input type="date" required aria-label="Day" value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="time" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} />
            {time && (
              <button type="button" className="chip" onClick={() => setTime('')}>
                No time
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              Save
            </button>
            <button type="button" className="btn" onClick={() => setMode('menu')}>
              Back
            </button>
          </form>
        )}

        {mode === 'merge' && (
          <div className="place-merge">
            <p className="muted small">Merge “{refTitle(row)}” with:</p>
            <ul>
              {candidates.map((c) => (
                <li key={refKey(c)}>
                  <button type="button" className="food-action" onClick={() => onMerge(c)}>
                    <span className="place-merge-text">
                      <strong>{refTitle(c)}</strong>
                      <span className="muted small">{refLine(c)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={() => setMode('menu')}>
              Back
            </button>
          </div>
        )}
      </div>
    </>
  );
}
