import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ArmyIcon, GripIcon, RoadIcon, SkullIcon } from '../../icons';
import { newId } from '../../lib/db';
import { href, navigate } from '../../lib/router';
import { CATAN_VARIANTS, cleanCatan, isCatan, moveSeat, seatOrder, titleHasColors, titleHasOrder, type CatanInfo } from './catan';
import { ColorDot } from './ColorDot';
import { winnersFromScores } from './games';
import { LordPicker } from './LordPicker';
import { RuleSelect } from './TitlesTab';
import { WATERDEEP_LORDS, cleanWaterdeep, isWaterdeep, lordBonus, type WaterdeepInfo } from './waterdeep';
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
  const [waterdeep, setWaterdeep] = useState<WaterdeepInfo>(existing?.waterdeep ?? {});
  // Seat drag: the row being dragged floats under the pointer.
  const [drag, setDrag] = useState<{ id: string; y: number; grab: number } | null>(null);
  const rows = useRef<Record<string, HTMLLIElement | null>>({});
  const list = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    for (const [id, el] of Object.entries(rows.current)) {
      if (!el) continue;
      el.style.transform = '';
      if (drag?.id === id) {
        // Stay inside the list: not above its first row or below its last.
        const box = list.current?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        let top = drag.y - drag.grab;
        if (box) top = Math.min(Math.max(top, box.top), box.bottom - r.height);
        el.style.transform = `translateY(${top - r.top}px)`;
      }
    }
  });
  const back = `/games/night/${night.id}`;
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const title = titles.find((t) => t.id === titleId);
  const settings = title ?? { name: newName };
  const hasColors = titleHasColors(settings);
  const hasOrder = titleHasOrder(settings);
  const catanGame = isCatan(settings);
  const waterdeepGame = isWaterdeep(settings);

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
      // Kept even when the game is renamed, like the Catan details.
      waterdeep: cleanWaterdeep(waterdeep, playerIds),
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
      {waterdeepGame && (
        <div className="field">
          <span>Skullport expansion</span>
          <div className="chips" style={{ alignItems: 'center' }}>
            <button type="button" className="chip" aria-pressed={!!waterdeep.skullport} onClick={() => setWaterdeep({ ...waterdeep, skullport: !waterdeep.skullport })}>
              Played with corruption
            </button>
            {waterdeep.skullport && (
              <input
                type="number"
                step="any"
                value={waterdeep.corruptionValue ?? ''}
                onChange={(e) => {
                  const n = e.target.value.trim();
                  setWaterdeep({ ...waterdeep, corruptionValue: n && Number.isFinite(Number(n)) ? Number(n) : undefined });
                }}
                placeholder="Each, e.g. -5"
                aria-label="Points each corruption is worth"
                style={{ width: '7.5rem', flex: 'none' }}
              />
            )}
          </div>
        </div>
      )}
      {playerIds.length > 0 && (
        <div className="field">
          <span>Scores and winner</span>
          {(hasOrder || hasColors || catanGame || waterdeepGame) && (
            <span className="muted small">
              {[waterdeepGame && 'Tap the Lord name to choose it, then enter points before the Lord and the final total', hasOrder && 'Drag the players to choose the turn order', hasColors && 'tap the dots to choose colors', catanGame && 'tap the road and shield for longest road and largest army'].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())}.
            </span>
          )}
          <ul className="game-scores" ref={list}>
            {playerIds.map((id) => {
              const order = hasOrder ? seatOrder(playerIds, catan.seats) : playerIds;
              const idx = order.indexOf(id);
              const bonus = lordBonus(waterdeep.before?.[id], numeric[id]);
              // Every player has a different Lord: leave out the ones the others already picked.
              const taken = playerIds.filter((p) => p !== id).map((p) => waterdeep.lords?.[p]?.trim().toLowerCase());
              return (
              <li
                key={id}
                className={waterdeepGame ? (waterdeep.skullport ? 'wd wd-sk' : 'wd') : undefined}
                ref={(el) => {
                  rows.current[id] = el;
                }}
                style={
                  drag?.id === id
                    ? { order: idx, position: 'relative', zIndex: 5, scale: '1.03', background: 'var(--bg)', borderRadius: 14, boxShadow: '0 10px 28px rgba(0,0,0,.25)', transition: 'scale .15s, box-shadow .15s' }
                    : { order: idx, transition: 'scale .15s, box-shadow .15s' }
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
                  <span style={waterdeepGame ? { overflow: 'hidden', textOverflow: 'ellipsis', flex: 'none', maxWidth: '38%', fontWeight: 700 } : { overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{name(id)}</span>
                  {waterdeepGame && <span aria-hidden="true" style={{ flex: 'none', width: 1, height: 16, margin: '0 10px', background: 'currentColor', opacity: 0.3 }} />}
                  {waterdeepGame && (
                    <LordPicker
                      value={waterdeep.lords?.[id]}
                      label={name(id)}
                      options={WATERDEEP_LORDS.filter((l) => !taken.includes(l.toLowerCase()))}
                      onChange={(l) => setWaterdeep({ ...waterdeep, lords: { ...waterdeep.lords, [id]: l } })}
                    />
                  )}
                  {waterdeepGame && bonus !== undefined && <span className="muted small">{bonus >= 0 ? '+' : ''}{bonus}</span>}
                  {catanGame &&
                    ([['longestRoad', 'Longest road', <RoadIcon key="r" />], ['largestArmy', 'Largest army', <ArmyIcon key="a" />]] as const).map(([key, label, icon]) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={catan[key] === id}
                        aria-label={`${name(id)} ${label}`}
                        onClick={() => setCatan({ ...catan, [key]: catan[key] === id ? undefined : id })}
                        style={{ width: 36, height: 44, padding: 0, border: 0, background: 'none', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer', opacity: catan[key] === id ? 1 : 0.25 }}
                      >
                        <span style={{ width: 24, height: 24, display: 'inline-flex' }}>{icon}</span>
                      </button>
                    ))}
                </div>
                {waterdeepGame && (
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={waterdeep.before?.[id] ?? ''}
                    onChange={(e) => {
                      const n = e.target.value.trim();
                      const rest = { ...waterdeep.before };
                      if (n && Number.isFinite(Number(n))) rest[id] = Number(n);
                      else delete rest[id];
                      setWaterdeep({ ...waterdeep, before: rest });
                    }}
                    placeholder="Before"
                    aria-label={`${name(id)} points before the Lord`}
                  />
                )}
                {waterdeepGame && waterdeep.skullport && (
                  <div className="wd-icon-field">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={waterdeep.corruptions?.[id] ?? ''}
                      onChange={(e) => {
                        const n = e.target.value.trim();
                        const rest = { ...waterdeep.corruptions };
                        if (n && Number.isFinite(Number(n)) && Number(n) >= 0) rest[id] = Math.floor(Number(n));
                        else delete rest[id];
                        setWaterdeep({ ...waterdeep, corruptions: rest });
                      }}
                      placeholder="0"
                      aria-label={`${name(id)} number of corruptions`}
                    />
                    <span className="wd-icon" aria-hidden="true">
                      <SkullIcon />
                    </span>
                  </div>
                  )}
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={scores[id] ?? ''}
                  onChange={(e) => setScores({ ...scores, [id]: e.target.value })}
                  placeholder={waterdeepGame ? 'Final' : 'Score'}
                  aria-label={`${name(id)} ${waterdeepGame ? 'final score, after the Lord' : 'score'}`}
                />
                <button type="button" className="chip" aria-pressed={winners.includes(id)} onClick={() => toggleWinner(id)} aria-label={`${name(id)} won`}>
                  🏆
                </button>
              </li>
              );
            })}
          </ul>
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
