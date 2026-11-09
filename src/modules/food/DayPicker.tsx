import { useState } from 'react';
import { addDays } from './stock';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "Which day?": a small month calendar in a bottom sheet. Tapping a day picks it; days after today, and days where logging
 * would change nothing (`isDisabled`), are greyed out and can't be tapped. Today is the one to tap for what just happened.
 */
export function DayPicker({ today, title, isDisabled, onPick, onClose }: { today: string; title: string; isDisabled(date: string): boolean; onPick(date: string): void; onClose(): void }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  // Monday-first grid: blanks before the 1st, then every day of the month.
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
  const shift = (by: number) => setMonth(addDays(`${month}-15`, by * 30).slice(0, 7));
  const title2 = new Date(`${first}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const nextOk = month < today.slice(0, 7);
  const anyDisabled = cells.some((d) => d && d <= today && isDisabled(d));

  return (
    <>
      <button type="button" className="day-scrim" aria-label="Cancel" onClick={onClose} />
      <div className="day-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="food-grip" aria-hidden />
        <h3 className="day-title">{title}</h3>
        <div className="day-nav">
          <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
            ‹
          </button>
          <strong>{title2}</strong>
          <button type="button" className="icon-btn" aria-label="Next month" disabled={!nextOk} onClick={() => shift(1)}>
            ›
          </button>
        </div>
        <div className="day-grid-pick" role="grid">
          {WEEKDAYS.map((w) => (
            <span key={w} className="muted small day-wd">
              {w}
            </span>
          ))}
          {cells.map((d, i) =>
            d ? (
              <button
                key={d}
                type="button"
                className={`day-cell${d === today ? ' day-today' : ''}`}
                disabled={d > today || isDisabled(d)}
                aria-label={new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                onClick={() => onPick(d)}
              >
                {Number(d.slice(8))}
              </button>
            ) : (
              <span key={`b${i}`} />
            ),
          )}
        </div>
        <button type="button" className="btn btn-primary day-today-btn" disabled={isDisabled(today)} onClick={() => onPick(today)}>
          Today
        </button>
        {anyDisabled && <p className="muted small">Greyed days are before a count, or before this was bought, so logging them would change nothing.</p>}
      </div>
    </>
  );
}
