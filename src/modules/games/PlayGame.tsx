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

/**
 * A game in progress: the scoreboard on top (positions, totals, last round), the next round's points
 * below, and the rounds so far to fix a mistake. Totals only change when you add the round.
 */
export function PlayGame({ night, match, players, title, onSave }: Props) {
  const ids = match.playerIds;
  const rule = title?.rule ?? 'manual';
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const [rounds, setRounds] = useState<Record<string, number>[]>(match.rounds ?? []);
  // Unsaved text per round card (index = rounds.length is the next, blank round).
  const [drafts, setDrafts] = useState<Record<number, Record<string, string>>>({});
  const [cur, setCur] = useState(match.rounds?.length ?? 0);
  const track = useRef<HTMLDivElement>(null);
  const pills = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string[] | null>(match.live ? null : match.winnerIds);

  const board = standings(rounds, ids, rule);
  const started = rounds.length > 0;
  const totals = roundTotals(rounds, ids);
  const winners = picked ?? winnersFromScores(rule, totals, ids);
  const persist = (next: Record<string, number>[], done = false) => {
    const t = roundTotals(next, ids);
    const w = picked ?? winnersFromScores(rule, t, ids);
    const updated: Match = { ...match, rounds: next, scores: t, winnerIds: done || !match.live ? w : [] };
    if (done) delete updated.live;
    return onSave({ ...night, matches: night.matches.map((m) => (m.id === match.id ? updated : m)), updatedAt: new Date().toISOString() });
  };

  const committed = (i: number, id: string) => (i < rounds.length && rounds[i][id] !== undefined ? String(rounds[i][id]) : '');
  const cell = (i: number, id: string) => drafts[i]?.[id] ?? committed(i, id);
  const dirty = (i: number) => ids.some((id) => cell(i, id).trim() !== committed(i, id).trim());
  const parsed = (i: number) => {
    const out: Record<string, number> = {};
    for (const id of ids) {
      const v = cell(i, id).trim().replace(',', '.');
      out[id] = v && Number.isFinite(Number(v)) ? Number(v) : 0;
    }
    return out;
  };
  const dropDraft = (i: number) =>
    setDrafts((d) => {
      const { [i]: _gone, ...rest } = d;
      return rest;
    });
  const goTo = (i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft - (el.children[0] as HTMLElement).offsetLeft, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = track.current;
    if (!el || el.children.length < 1) return;
    const step = el.children.length > 1 ? (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft : 1;
    const i = Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollLeft / step)));
    if (i !== cur) {
      setCur(i);
      (pills.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  };
  const save = (i: number) => {
    if (!dirty(i)) return;
    const next = i < rounds.length ? rounds.map((r, j) => (j === i ? parsed(i) : r)) : [...rounds, parsed(i)];
    setRounds(next);
    dropDraft(i);
    persist(next);
    // After adding a round, move on to the next blank one.
    if (i >= rounds.length) setTimeout(() => goTo(i + 1), 50);
  };
  const removeRound = (i: number) => {
    const next = rounds.filter((_, j) => j !== i);
    setRounds(next);
    setDrafts({});
    setCur(Math.min(cur, next.length));
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
              <span className="muted small">{!started ? 'No rounds yet' : s.trail.slice(-6).map(fmt).join(' · ')}</span>
            </span>
            <span className="score-total">
              {fmt(s.total)}
              {started && (
                <small className="score-gap">
                  {!s.above ? 'Leading' : s.above.gap === 0 ? `Level with ${name(s.above.id)}` : `${fmt(s.above.gap)} behind ${name(s.above.id)}`}
                </small>
              )}
            </span>
          </li>
        ))}
      </ol>

      <nav className="round-nav" ref={pills} aria-label="Rounds">
        {[...rounds, null].map((_, i) => (
          <button key={i} type="button" className="round-pill" aria-current={cur === i ? 'true' : undefined} onClick={() => goTo(i)} aria-label={i < rounds.length ? `Round ${i + 1}` : `New round ${i + 1}`}>
            {i < rounds.length ? i + 1 : '+'}
            {dirty(i) && <i aria-hidden />}
          </button>
        ))}
      </nav>
      <div className="round-track" ref={track} onScroll={onScroll}>
        {[...rounds, null].map((_, i) => {
          const isNew = i === rounds.length;
          return (
            <section key={i} className="round-card" aria-label={isNew ? `Round ${i + 1}, new` : `Round ${i + 1}`}>
              <header>
                <h2>Round {i + 1}</h2>
                <span className="muted small">{isNew ? 'Next round' : dirty(i) ? 'Unsaved changes' : 'Saved'}</span>
                {!isNew && (
                  <button type="button" className="round-del" onClick={() => removeRound(i)} aria-label={`Delete round ${i + 1}`}>
                    <TrashIcon />
                  </button>
                )}
              </header>
              <ul>
                {ids.map((id, k) => (
                  <li key={id}>
                    <label htmlFor={`pts-${i}-${id}`}>{name(id)}</label>
                    <input
                      id={`pts-${i}-${id}`}
                      type="text"
                      inputMode="decimal"
                      enterKeyHint={k === ids.length - 1 ? 'done' : 'next'}
                      placeholder="0"
                      value={cell(i, id)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [i]: { ...(d[i] ?? Object.fromEntries(ids.map((x) => [x, committed(i, x)]))), [id]: e.target.value } }))}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        if (k < ids.length - 1) document.getElementById(`pts-${i}-${ids[k + 1]}`)?.focus();
                        else save(i);
                      }}
                    />
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary round-save" disabled={!dirty(i)} onClick={() => save(i)}>
                {isNew ? 'Add round' : 'Save changes'}
              </button>
              <div className="round-hop">
                {i > 0 ? (
                  <button type="button" onClick={() => goTo(i - 1)}>
                    ‹ Round {i}
                  </button>
                ) : (
                  <span />
                )}
                {i < rounds.length && (
                  <button type="button" onClick={() => goTo(i + 1)}>
                    {i + 1 === rounds.length ? 'New round' : `Round ${i + 2}`} ›
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

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
