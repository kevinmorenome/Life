import { useRef, useState } from 'react';
import { CheckIcon, TrashIcon } from '../../icons';
import { navigate } from '../../lib/router';
import { roundTotals, standings, winnersFromScores } from './games';
import type { GameNight, GameTitle, Match, Player } from './types';

interface Props {
  night: GameNight;
  match: Match;
  players: Player[];
  title?: GameTitle;
  onSave: (n: GameNight) => Promise<void>;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

/**
 * A game in progress: the scoreboard on top (positions, totals, last round), the next round's points
 * below, and the rounds so far to fix a mistake. Totals only change when you add the round.
 */
export function PlayGame({ night, match, players, title, onSave }: Props) {
  const ids = match.playerIds;
  const rule = title?.rule ?? 'manual';
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const [rounds, setRounds] = useState<Record<string, number>[]>(match.rounds ?? []);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[] | null>(match.live ? null : match.winnerIds);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const board = standings(rounds, ids, rule);
  const started = rounds.length > 0;
  const totals = roundTotals(rounds, ids);
  const winners = picked ?? winnersFromScores(rule, totals, ids);
  const filled = ids.some((id) => draft[id]?.trim());

  const persist = (next: Record<string, number>[], done = false) => {
    const t = roundTotals(next, ids);
    const w = picked ?? winnersFromScores(rule, t, ids);
    const updated: Match = { ...match, rounds: next, scores: t, winnerIds: done || !match.live ? w : [] };
    if (done) delete updated.live;
    return onSave({ ...night, matches: night.matches.map((m) => (m.id === match.id ? updated : m)), updatedAt: new Date().toISOString() });
  };

  const parsed = () => {
    const out: Record<string, number> = {};
    for (const id of ids) {
      const v = draft[id]?.trim().replace(',', '.');
      out[id] = v && Number.isFinite(Number(v)) ? Number(v) : 0;
    }
    return out;
  };
  const commit = () => {
    if (!filled) return;
    const next = editing === null ? [...rounds, parsed()] : rounds.map((r, i) => (i === editing ? parsed() : r));
    setRounds(next);
    setDraft({});
    setEditing(null);
    persist(next);
    inputs.current[0]?.focus();
  };
  const edit = (i: number) => {
    setEditing(i);
    setDraft(Object.fromEntries(ids.map((id) => [id, rounds[i][id] !== undefined ? String(rounds[i][id]) : ''])));
    inputs.current[0]?.focus();
  };
  const removeRound = (i: number) => {
    const next = rounds.filter((_, j) => j !== i);
    setRounds(next);
    setDraft({});
    setEditing(null);
    persist(next);
  };

  const finish = async () => {
    await persist(rounds, true);
    navigate(`/games/night/${night.id}`);
  };
  const leaveForNow = async () => {
    await persist(rounds);
    navigate(`/games/night/${night.id}`);
  };

  return (
    <>
      <div className="play-head">
        <h1 className="page-title">{title?.name ?? 'Game'}</h1>
        <span className="muted small">
          {match.live ? 'Live' : 'Finished'} · {rounds.length} {rounds.length === 1 ? 'round' : 'rounds'}
          {rule !== 'manual' && ` · ${rule === 'high' ? 'highest' : 'lowest'} wins`}
        </span>
      </div>

      <ol className="scoreboard" aria-label="Scoreboard">
        {board.map((s) => (
          <li key={s.id} className={`score-row${started && s.position === 1 && rule !== 'manual' ? ' score-first' : ''}`}>
            <span className="score-pos" aria-label={`Position ${s.position}`}>
              {started && s.position === 1 && rule !== 'manual' ? '👑' : s.position}
            </span>
            <span className="score-who">
              <strong>{name(s.id)}</strong>
              <span className="muted small">
                {!started ? 'No rounds yet' : !s.above ? 'Leading' : s.above.gap === 0 ? `Level with ${name(s.above.id)}` : `${fmt(s.above.gap)} behind ${name(s.above.id)}`}
                {s.trail.length > 1 && ` · ${s.trail.slice(-6).map(fmt).join(' · ')}`}
              </span>
            </span>
            <span className="score-total">
              {fmt(s.total)}
              {s.last !== undefined && started && <small className={s.last < 0 === (rule !== 'low') ? 'score-down' : 'score-up'}>{signed(s.last)}</small>}
            </span>
          </li>
        ))}
      </ol>

      <section className="round-entry" aria-label={editing === null ? `Round ${rounds.length + 1}` : `Edit round ${editing + 1}`}>
        <h2>{editing === null ? `Round ${rounds.length + 1}` : `Edit round ${editing + 1}`}</h2>
        <ul>
          {ids.map((id, i) => (
            <li key={id}>
              <label htmlFor={`pts-${id}`}>{name(id)}</label>
              <input
                id={`pts-${id}`}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                type="text"
                inputMode="decimal"
                enterKeyHint={i === ids.length - 1 ? 'done' : 'next'}
                placeholder="0"
                value={draft[id] ?? ''}
                onChange={(e) => setDraft({ ...draft, [id]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (i < ids.length - 1) inputs.current[i + 1]?.focus();
                  else commit();
                }}
              />
            </li>
          ))}
        </ul>
        <div className="round-actions">
          {editing !== null && (
            <button type="button" className="btn btn-ghost" onClick={() => (setEditing(null), setDraft({}))}>
              Cancel
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!filled} onClick={commit}>
            {editing === null ? 'Add round' : 'Update round'}
          </button>
        </div>
      </section>

      {started && (
        <section className="round-history">
          <h2>Rounds</h2>
          <ul>
            {rounds.map((r, i) => (
              <li key={i} className={editing === i ? 'is-editing' : undefined}>
                <button type="button" onClick={() => edit(i)} aria-label={`Edit round ${i + 1}`}>
                  <b>{i + 1}</b>
                  <span>{ids.map((id) => `${name(id)} ${fmt(r[id] ?? 0)}`).join(' · ')}</span>
                </button>
                {i === rounds.length - 1 && (
                  <button type="button" className="icon-btn" onClick={() => removeRound(i)} aria-label={`Delete round ${i + 1}`}>
                    <TrashIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(rule === 'manual' || picked) && started && (
        <div className="field">
          <span>Winner</span>
          <div className="chips">
            {ids.map((id) => (
              <button key={id} type="button" className="chip" aria-pressed={winners.includes(id)} onClick={() => setPicked(winners.includes(id) ? winners.filter((x) => x !== id) : [...winners, id])}>
                🏆 {name(id)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="play-bar">
        <button type="button" className="btn btn-ghost" onClick={leaveForNow}>
          {match.live ? 'Save for later' : 'Back'}
        </button>
        {match.live && (
          <button type="button" className="btn btn-primary play-finish" disabled={!started} onClick={finish}>
            <CheckIcon /> Finish game
          </button>
        )}
      </div>
    </>
  );
}
