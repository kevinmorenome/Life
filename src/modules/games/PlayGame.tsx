import { useState } from 'react';
import { TrashIcon } from '../../icons';
import { navigate } from '../../lib/router';
import { roundTotals, winnersFromScores } from './games';
import type { GameNight, GameTitle, Match, Player } from './types';

interface Props {
  night: GameNight;
  match: Match;
  players: Player[];
  title?: GameTitle;
  onSave: (n: GameNight) => Promise<void>;
}

/** The score sheet of a game played in rounds: one row per round, one column per player, running totals below. */
export function PlayGame({ night, match, players, title, onSave }: Props) {
  const ids = match.playerIds;
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const toText = (rounds: Record<string, number>[]) => rounds.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));
  const [rows, setRows] = useState<Record<string, string>[]>(() => (match.rounds?.length ? toText(match.rounds) : [{}]));
  const [picked, setPicked] = useState<string[] | null>(match.live ? null : match.winnerIds);
  const rule = title?.rule ?? 'manual';

  const numeric = (rs: Record<string, string>[]) =>
    rs.map((r) => {
      const out: Record<string, number> = {};
      for (const id of ids) {
        const raw = r[id]?.trim();
        if (raw && raw !== '-' && Number.isFinite(Number(raw))) out[id] = Number(raw);
      }
      return out;
    });
  const rounds = numeric(rows);
  const totals = roundTotals(rounds, ids);
  const derived = winnersFromScores(rule, totals, ids);
  const winners = picked ?? derived;
  const anyScore = rounds.some((r) => Object.keys(r).length > 0);

  // Saves the sheet as it is; `done` also ends the game and fixes the winners.
  const persist = (next: Record<string, string>[], done = false) => {
    const rs = numeric(next);
    const t = roundTotals(rs, ids);
    const w = picked ?? winnersFromScores(rule, t, ids);
    const updated: Match = { ...match, rounds: rs, scores: t, live: done ? undefined : match.live, winnerIds: done || !match.live ? w : [] };
    if (done) delete updated.live;
    return onSave({ ...night, matches: night.matches.map((m) => (m.id === match.id ? updated : m)), updatedAt: new Date().toISOString() });
  };
  const setCell = (i: number, id: string, v: string) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, [id]: v } : r)));
  const addRound = () => {
    const next = [...rows, {}];
    setRows(next);
    persist(rows);
  };
  const removeLast = () => {
    const next = rows.slice(0, -1);
    setRows(next.length ? next : [{}]);
    persist(next.length ? next : [{}]);
  };
  const lead = (id: string) => (rule === 'manual' ? false : winners.includes(id) && anyScore);
  const back = `/games/night/${night.id}`;

  return (
    <>
      <h1 className="page-title">{title?.name ?? 'Game'}</h1>
      <p className="muted small">{match.live ? 'In progress · ' : ''}Points per round. {rule === 'high' ? 'Highest total wins.' : rule === 'low' ? 'Lowest total wins.' : 'You pick the winner.'}</p>
      <div className="score-wrap">
        <table className="score-table">
          <thead>
            <tr>
              <th aria-label="Round" />
              {ids.map((id) => (
                <th key={id}>{name(id)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <th scope="row">{i + 1}</th>
                {ids.map((id) => (
                  <td key={id}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r[id] ?? ''}
                      onChange={(e) => setCell(i, id, e.target.value)}
                      onBlur={() => persist(rows)}
                      aria-label={`${name(id)}, round ${i + 1}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {ids.map((id) => (
                <td key={id} className={lead(id) ? 'score-lead' : undefined}>
                  {totals[id]}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="game-add">
        <button type="button" className="btn" onClick={addRound}>
          Add round
        </button>
        {rows.length > 1 && (
          <button type="button" className="icon-btn" onClick={removeLast} aria-label="Remove last round">
            <TrashIcon />
          </button>
        )}
      </div>
      {(rule === 'manual' || picked) && (
        <div className="field">
          <span>Winner</span>
          <div className="chips">
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                className="chip"
                aria-pressed={winners.includes(id)}
                onClick={() => setPicked(winners.includes(id) ? winners.filter((x) => x !== id) : [...winners, id])}
              >
                🏆 {name(id)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            await persist(rows);
            navigate(back);
          }}
        >
          {match.live ? 'Save for later' : 'Back'}
        </button>
        <button
          className="btn btn-primary"
          disabled={!anyScore}
          onClick={async () => {
            await persist(rows, true);
            navigate(back);
          }}
        >
          {match.live ? 'Finish game' : 'Save'}
        </button>
      </div>
    </>
  );
}
