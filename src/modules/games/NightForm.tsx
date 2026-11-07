import { useState, type FormEvent } from 'react';
import { newId } from '../../lib/db';
import { today } from '../../lib/format';
import { navigate } from '../../lib/router';
import type { GameNight, Player } from './types';

interface Props {
  existing?: GameNight;
  players: Player[];
  onSave: (n: GameNight) => Promise<void>;
  onSavePlayer: (p: Player) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

/** Start (or edit) a night: when, where, and who is playing. */
export function NightForm({ existing, players, onSave, onSavePlayer, onDelete }: Props) {
  const [date, setDate] = useState(existing?.date ?? today());
  const [location, setLocation] = useState(existing?.location ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [ids, setIds] = useState<string[]>(existing?.playerIds ?? []);
  const [newName, setNewName] = useState('');
  const back = existing ? `/games/night/${existing.id}` : '/games';

  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  async function addPlayer() {
    const name = newName.trim();
    if (!name) return;
    const found = players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (found) {
      if (!ids.includes(found.id)) toggle(found.id);
    } else {
      const now = new Date().toISOString();
      const p: Player = { id: newId(), name, createdAt: now, updatedAt: now };
      await onSavePlayer(p);
      setIds((cur) => [...cur, p.id]);
    }
    setNewName('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    const night: GameNight = {
      matches: [],
      ...existing,
      id: existing?.id ?? newId(),
      date,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      playerIds: ids,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await onSave(night);
    navigate(`/games/night/${night.id}`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h1>{existing ? 'Edit game night' : 'New game night'}</h1>
      <div className="field-grid">
        <label className="field">
          <span>Date</span>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Where (optional)</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kevin’s place" />
        </label>
      </div>
      <div className="field">
        <span>Who’s playing</span>
        <div className="chips">
          {players.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={ids.includes(p.id)} onClick={() => toggle(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="game-add">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPlayer();
              }
            }}
            placeholder="Someone new"
            aria-label="New player name"
          />
          <button type="button" className="btn" disabled={!newName.trim()} onClick={addPlayer}>
            Add
          </button>
        </div>
      </div>
      <label className="field">
        <span>Notes (optional)</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="form-actions">
        {existing && onDelete && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              if (window.confirm('Delete this game night and its games?')) {
                await onDelete(existing.id);
                navigate('/games');
              }
            }}
          >
            Delete
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => navigate(back)}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={ids.length < 2}>
          Save
        </button>
      </div>
    </form>
  );
}
