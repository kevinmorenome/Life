import { useState } from 'react';
import { today } from '../../lib/format';
import { groupWearsByMonth } from './wear';

interface Props {
  wears: string[];
  /** Undated wears from before tracking. */
  priorWears?: number;
  hint?: string;
  /** Extra line under a date, e.g. which outfit it was worn with. */
  noteFor?: (date: string) => string | undefined;
  /** Lets the date picker go past today; `onAdd` then receives future dates to schedule. */
  allowFuture?: boolean;
  canAdd?: (date: string) => boolean;
  onAdd: (date: string) => void;
  onRemove: (index: number) => void;
}

const day = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const monthTitle = (m: string) =>
  new Date(m + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export function WearLog({ wears, priorWears, hint, noteFor, allowFuture, canAdd, onAdd, onRemove }: Props) {
  const [date, setDate] = useState(today());
  const months = groupWearsByMonth(wears);

  return (
    <section className="plain wear-log">
      <h2>
        Wear log <span className="count-badge">{wears.length + (priorWears ?? 0)}</span>
      </h2>
      {hint && <p className="muted small">{hint}</p>}
      <div className="wear-add">
        <input type="date" value={date} max={allowFuture ? undefined : today()} onChange={(e) => setDate(e.target.value)} />
        <button className="btn btn-primary" disabled={!date || (canAdd ? !canAdd(date) : false)} onClick={() => onAdd(date)}>
          {allowFuture && date > today() ? 'Schedule' : 'Log wear'}
        </button>
      </div>

      {months.length === 0 && <p className="muted small">No dated wears yet. Log one above.</p>}
      {months.map((m) => (
        <div key={m.month} className="wear-month">
          <h3>
            {monthTitle(m.month)} <span className="muted">· {m.entries.length}</span>
          </h3>
          <ul className="wear-entries">
            {m.entries.map(({ date: d, index }) => (
              <li key={`${d}-${index}`}>
                <span className="wear-dot" aria-hidden />
                <span className="wear-main">
                  {day(d)}
                  {noteFor?.(d) && <span className="muted small">{noteFor(d)}</span>}
                </span>
                <button className="wear-remove" aria-label={`Remove wear on ${day(d)}`} onClick={() => onRemove(index)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {priorWears ? (
        <p className="muted small wear-prior">
          Plus {priorWears} earlier {priorWears === 1 ? 'wear' : 'wears'} without dates.
        </p>
      ) : null}
    </section>
  );
}
