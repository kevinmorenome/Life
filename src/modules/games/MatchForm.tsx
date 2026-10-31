import { useState, type FormEvent } from 'react';
import { newId } from '../../lib/db';
import { href, navigate } from '../../lib/router';
import { winnersFromScores } from './games';
import { RuleSelect } from './TitlesTab';
import type { GameNight, GameTitle, Match, Player, ScoreRule } from './types';

interface Props {
  night: GameNight;
  existing?: Match;
  players: Player[];
  titles: GameTitle[];
  onSave: (n: GameNight) => Promise<void>;
  onSaveTitle: (t: GameTitle) => Promise<void>;
}

/** Log one game: which, who played, scores, and the winner (worked out from the scores, but you can override). */
export function MatchForm({ night, existing, players, titles, onSave, onSaveTitle }: Props) {
  const [titleId, setTitleId] = useState(existing?.titleId ?? '');
  const [newName, setNewName] = useState('');
  const [newRule, setNewRule] = useState<ScoreRule>('high');
  const [playerIds, setPlayerIds] = useState<string[]>(existing?.playerIds ?? night.playerIds);
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(existing?.scores ?? {}).map(([k, v]) => [k, String(v)])),
  );
  // null: follow the scores; an array: the user picked.
  const [picked, setPicked] = useState<string[] | null>(existing ? existing.winnerIds : null);
  const [note, setNote] = useState(existing?.note ?? '');
  const back = `/games/night/${night.id}`;
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const title = titles.find((t) => t.id === titleId);

  const numeric: Record<string, number> = {};
  for (const id of playerIds) {
    const raw = scores[id]?.trim();
    if (raw && Number.isFinite(Number(raw))) numeric[id] = Number(raw);
  }
  const derived = winnersFromScores(title?.rule ?? (titleId ? 'manual' : newRule), numeric, playerIds);
  const winners = (picked ?? derived).filter((id) => playerIds.includes(id));

  const togglePlayer = (id: string) => setPlayerIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleWinner = (id: string) => setPicked(winners.includes(id) ? winners.filter((x) => x !== id) : [...winners, id]);

  async function submit(e: FormEvent, live = false) {
    e.preventDefault();
    let id = titleId;
    if (!id) {
      const now = new Date().toISOString();
      const t: GameTitle = { id: newId(), name: newName.trim(), rule: newRule, createdAt: now, updatedAt: now };
      await onSaveTitle(t);
      id = t.id;
    }
    const match: Match = {
      ...existing,
      id: existing?.id ?? newId(),
      titleId: id,
      playerIds,
      scores: live ? {} : numeric,
      winnerIds: live ? [] : winners,
      note: note.trim() || undefined,
      ...(live ? { live: true, rounds: [] } : {}),
    };
    const matches = existing ? night.matches.map((m) => (m.id === match.id ? match : m)) : [...night.matches, match];
    await onSave({ ...night, matches, updatedAt: new Date().toISOString() });
    navigate(live ? `${back}/play/${match.id}` : back);
  }

  const ready = (titleId || newName.trim()) && playerIds.length >= 2;

  return (
    <form className="form" onSubmit={submit}>
      <h1>{existing ? 'Edit game' : 'Log a game'}</h1>
      <div className="field">
        <span>Game</span>
        <div className="chips">
          {[...titles].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
            <button key={t.id} type="button" className="chip" aria-pressed={titleId === t.id} onClick={() => setTitleId(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        {!titleId && (
          <div className="game-add">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Or a new game" aria-label="New game name" />
            <RuleSelect value={newRule} onChange={setNewRule} />
          </div>
        )}
        {title && <span className="muted small">{title.rule === 'manual' ? 'You pick the winner.' : title.rule === 'high' ? 'Highest score wins.' : 'Lowest score wins.'}</span>}
      </div>
      <div className="field">
        <span>Players</span>
        <div className="chips">
          {players.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={playerIds.includes(p.id)} onClick={() => togglePlayer(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
      {playerIds.length > 0 && (
        <div className="field">
          <span>Scores and winner</span>
          <ul className="game-scores">
            {playerIds.map((id) => (
              <li key={id}>
                <span>{name(id)}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={scores[id] ?? ''}
                  onChange={(e) => setScores({ ...scores, [id]: e.target.value })}
                  placeholder="Score"
                  aria-label={`${name(id)} score`}
                />
                <button
                  type="button"
                  className="chip"
                  aria-pressed={winners.includes(id)}
                  onClick={() => toggleWinner(id)}
                  aria-label={`${name(id)} won`}
                >
                  🏆
                </button>
              </li>
            ))}
          </ul>
          {picked && (
            <button type="button" className="btn btn-ghost" onClick={() => setPicked(null)}>
              Use the scores
            </button>
          )}
        </div>
      )}
      <label className="field">
        <span>Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="form-actions">
        {existing && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              if (window.confirm('Delete this game?')) {
                await onSave({ ...night, matches: night.matches.filter((m) => m.id !== existing.id), updatedAt: new Date().toISOString() });
                navigate(back);
              }
            }}
          >
            Delete
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => navigate(back)}>
          Cancel
        </button>
        {!existing && (
          <button type="button" className="btn" disabled={!ready} onClick={(e) => submit(e, true)}>
            Score by rounds
          </button>
        )}
        {existing?.rounds && (
          <a className="btn" href={href(`${back}/play/${existing.id}`)}>
            Edit rounds
          </a>
        )}
        <button className="btn btn-primary" disabled={!ready}>
          Save
        </button>
      </div>
    </form>
  );
}
