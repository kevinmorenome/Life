import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { GripIcon } from '../../icons';
import { newId } from '../../lib/db';
import { href, navigate } from '../../lib/router';
import { CATAN_ROUTES, CATAN_VARIANTS, cleanCatan, isCatan, moveSeat, seatOrder, titleHasColors, titleHasOrder, type CatanInfo } from './catan';
import { ColorDot } from './ColorDot';
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
  const [catan, setCatan] = useState<CatanInfo>(existing?.catan ?? {});
  // Seat drag: the row being dragged floats under the pointer.
  const [drag, setDrag] = useState<{ id: string; y: number; grab: number } | null>(null);
  const rows = useRef<Record<string, HTMLLIElement | null>>({});
  useLayoutEffect(() => {
    for (const [id, el] of Object.entries(rows.current)) {
      if (!el) continue;
      el.style.transform = '';
      if (drag?.id === id) el.style.transform = `translateY(${drag.y - drag.grab - el.getBoundingClientRect().top}px)`;
    }
  });
  const back = `/games/night/${night.id}`;
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const title = titles.find((t) => t.id === titleId);
  const settings = title ?? { name: newName };
  const hasColors = titleHasColors(settings);
  const hasOrder = titleHasOrder(settings);
  const catanGame = isCatan(settings);

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
      // Keep everything stored (seats, colors, variant, route) even when a setting is off; with turn order on, save the order shown.
      catan: cleanCatan(hasOrder ? { ...catan, seats: Object.fromEntries(seatOrder(playerIds, catan.seats).map((p, i) => [p, i + 1])) } : catan, playerIds),
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
          {hasOrder && <span className="muted small">Drag the dots to set the turn order.</span>}
          <ul className="game-scores">
            {(hasOrder ? seatOrder(playerIds, catan.seats) : playerIds).map((id, idx, order) => (
              <li
                key={id}
                ref={(el) => {
                  rows.current[id] = el;
                }}
                style={
                  drag?.id === id
                    ? { position: 'relative', zIndex: 5, scale: '1.03', background: 'var(--bg)', borderRadius: 14, boxShadow: '0 10px 28px rgba(0,0,0,.25)', transition: 'scale .15s, box-shadow .15s' }
                    : { transition: 'scale .15s, box-shadow .15s' }
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  {hasOrder && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`${name(id)}, seat ${idx + 1}. Drag to change turn order`}
                      style={{ touchAction: 'none', cursor: 'grab', userSelect: 'none', minHeight: 44, display: 'flex', alignItems: 'center', gap: 6, paddingRight: 6 }}
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const top = rows.current[id]?.getBoundingClientRect().top ?? e.clientY;
                        setDrag({ id, y: e.clientY, grab: e.clientY - top });
                      }}
                      onPointerMove={(e) => {
                        if (!drag || drag.id !== id) return;
                        setDrag({ ...drag, y: e.clientY });
                        const over = order.find((o) => {
                          const r = o !== id && rows.current[o]?.getBoundingClientRect();
                          return r && e.clientY >= r.top && e.clientY <= r.bottom;
                        });
                        if (over) setCatan((c) => ({ ...c, seats: moveSeat(order, id, order.indexOf(over)) }));
                      }}
                      onPointerUp={() => setDrag(null)}
                      onPointerCancel={() => setDrag(null)}
                      onKeyDown={(e) => {
                        const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                        if (!d || idx + d < 0 || idx + d >= order.length) return;
                        e.preventDefault();
                        setCatan((c) => ({ ...c, seats: moveSeat(order, id, idx + d) }));
                      }}
                    >
                      <b>{idx + 1}</b>
                      <span style={{ width: 20, height: 20, opacity: 0.55, flex: 'none', display: 'inline-flex' }}>
                        <GripIcon />
                      </span>
                    </span>
                  )}
                  {hasColors && (
                    <ColorDot
                      value={catan.colors?.[id]}
                      label={name(id)}
                      takenByOthers={playerIds.filter((p) => p !== id).map((p) => catan.colors?.[p] ?? '')}
                      onChange={(c) => setCatan({ ...catan, colors: { ...catan.colors, [id]: c } })}
                    />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name(id)}</span>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={scores[id] ?? ''}
                  onChange={(e) => setScores({ ...scores, [id]: e.target.value })}
                  placeholder="Score"
                  aria-label={`${name(id)} score`}
                />
                <button type="button" className="chip" aria-pressed={winners.includes(id)} onClick={() => toggleWinner(id)} aria-label={`${name(id)} won`}>
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
      {catanGame && (
        <div className="field">
          <span>Catan details</span>
          <span className="muted small">Variant</span>
          <div className="chips">
            {CATAN_VARIANTS.map((v) => (
              <button key={v} type="button" className="chip" aria-pressed={catan.variant === v} onClick={() => setCatan({ ...catan, variant: catan.variant === v ? undefined : v })}>
                {v}
              </button>
            ))}
          </div>
          <span className="muted small">How the winner got there</span>
          <div className="chips">
            {CATAN_ROUTES.map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={catan.winRoute === r} onClick={() => setCatan({ ...catan, winRoute: catan.winRoute === r ? undefined : r })}>
                {r}
              </button>
            ))}
          </div>
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
