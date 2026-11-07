import { useState } from 'react';
import { CheckIcon, EditIcon, TrashIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import { moveCheckin } from './checkins';
import type { Checkin } from './types';

/**
 * Edit and remove for one Swarm check-in, in the app only: Swarm is not touched. The day and time can be changed
 * (a check-in made on the wrong day); the place can't. Neither is undone by a later fetch: the Worker never
 * overwrites a record that already exists, edited or deleted.
 */
export function CheckinActions({ checkin }: { checkin: Checkin }) {
  const { save, remove } = useCollection<Checkin>('checkins');
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(checkin.date);
  const [time, setTime] = useState(checkin.time);

  if (editing) {
    const moved = moveCheckin(checkin, date, time, new Date().toISOString());
    return (
      <span className="checkin-edit">
        <input type="date" required aria-label="Day" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" required aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} />
        <button
          type="button"
          className="icon-btn"
          aria-label="Save check-in"
          onClick={() => {
            if (moved !== checkin) void save(moved);
            setEditing(false);
          }}
        >
          <CheckIcon />
        </button>
      </span>
    );
  }

  return (
    <span className="checkin-actions">
      <button
        type="button"
        className="icon-btn"
        aria-label={`Edit check-in at ${checkin.venue}`}
        onClick={() => {
          setDate(checkin.date);
          setTime(checkin.time);
          setEditing(true);
        }}
      >
        <EditIcon />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Remove check-in at ${checkin.venue}`}
        onClick={() => {
          if (confirm(`Remove “${checkin.venue}” from your check-ins here? It stays on Swarm.`)) void remove(checkin.id);
        }}
      >
        <TrashIcon />
      </button>
    </span>
  );
}
