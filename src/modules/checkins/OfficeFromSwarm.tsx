import { useMemo, useState } from 'react';
import { useSettings } from '../../lib/settings';
import { useCollection } from '../../lib/useCollection';
import type { WorkDay } from '../work/types';
import { officeBackfill } from './officeDays';
import { topVenues } from './placeStats';
import type { Checkin } from './types';

/** Settings: pick your office among the places you check in at, and mark the office days Swarm implies. */
export function OfficeFromSwarm() {
  const checkins = useCollection<Checkin>('checkins');
  const workdays = useCollection<WorkDay>('workdays');
  const { settings, update } = useSettings();
  const [message, setMessage] = useState('');
  const venues = useMemo(() => topVenues(checkins.items).slice(0, 50), [checkins.items]);
  const office = settings.officeVenue ?? '';
  const pending = useMemo(
    () => (office ? officeBackfill(checkins.items, office, workdays.items, new Date().toISOString()) : []),
    [checkins.items, workdays.items, office],
  );

  if (checkins.items.length === 0) return null;

  async function apply() {
    for (const day of pending) await workdays.save(day);
    setMessage(`Marked ${pending.length} office ${pending.length === 1 ? 'day' : 'days'}.`);
  }

  return (
    <section className="card">
      <h2>Office days from Swarm</h2>
      <p className="muted small">
        Choose your office. Every weekday with a check-in there that has nothing recorded becomes an office day. Days you set by hand or imported from the badge report are never changed, and days without a check-in are left alone.
      </p>
      <select
        className="input"
        aria-label="Your office"
        value={office}
        onChange={(e) => {
          setMessage('');
          void update({ officeVenue: e.target.value || undefined });
        }}
      >
        <option value="">Choose a place…</option>
        {venues.map((v) => (
          <option key={v.key} value={v.key}>
            {v.name}
            {v.city ? ` · ${v.city}` : ''} ({v.count})
          </option>
        ))}
      </select>
      {office && (
        <div className="form-actions start">
          <button className="btn btn-primary" disabled={pending.length === 0} onClick={apply}>
            {pending.length === 0 ? 'Nothing to mark' : `Mark ${pending.length} office ${pending.length === 1 ? 'day' : 'days'}`}
          </button>
        </div>
      )}
      {message && <p className="small">{message}</p>}
    </section>
  );
}
