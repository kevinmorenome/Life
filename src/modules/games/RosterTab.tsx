import { useState } from 'react';
import { newId } from '../../lib/db';
import { GamesTabs } from './GamesTabs';
import { playerRecords } from './games';
import type { GameNight, Player } from './types';

export function RosterTab({ players, nights, onSave }: { players: Player[]; nights: GameNight[]; onSave: (p: Player) => Promise<void> }) {
  const [name, setName] = useState('');
  const records = new Map(playerRecords(nights).map((r) => [r.id, r]));
  const sorted = [...players].sort((a, b) => (records.get(b.id)?.wins ?? 0) - (records.get(a.id)?.wins ?? 0) || a.name.localeCompare(b.name));

  const add = async () => {
    const n = name.trim();
    if (!n || players.some((p) => p.name.toLowerCase() === n.toLowerCase())) return;
    const now = new Date().toISOString();
    await onSave({ id: newId(), name: n, createdAt: now, updatedAt: now });
    setName('');
  };
  const rename = (p: Player) => {
    const n = window.prompt('Rename player', p.name)?.trim();
    if (n && n !== p.name) onSave({ ...p, name: n, updatedAt: new Date().toISOString() });
  };

  return (
    <>
      <GamesTabs active="players" />
      <form
        className="game-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a player" aria-label="Player name" />
        <button className="btn btn-primary" disabled={!name.trim()}>
          Add
        </button>
      </form>
      {sorted.length === 0 && <p className="muted">Add the people you play with. They’ll be one tap away when you start a night.</p>}
      <ul className="game-list">
        {sorted.map((p) => {
          const r = records.get(p.id);
          return (
            <li key={p.id}>
              <button className="game-row" onClick={() => rename(p)} aria-label={`Rename ${p.name}`}>
                <strong>{p.name}</strong>
                <span className="muted small">
                  {r ? `${r.wins} ${r.wins === 1 ? 'win' : 'wins'} in ${r.played} · ${Math.round(r.winRate * 100)}%` : 'No games yet'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
