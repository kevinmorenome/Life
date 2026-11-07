import { useState } from 'react';
import { newId } from '../../lib/db';
import { shortDate } from '../../lib/format';
import { GamesTabs } from './GamesTabs';
import { titleHasColors, titleHasOrder } from './catan';
import { titleStats } from './games';
import { RULE_LABELS, type GameNight, type GameTitle, type ScoreRule } from './types';

export function RuleSelect({ value, onChange }: { value: ScoreRule; onChange: (r: ScoreRule) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ScoreRule)} aria-label="How the winner is decided">
      {(Object.keys(RULE_LABELS) as ScoreRule[]).map((r) => (
        <option key={r} value={r}>
          {RULE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

export function TitlesTab({ titles, nights, onSave }: { titles: GameTitle[]; nights: GameNight[]; onSave: (t: GameTitle) => Promise<void> }) {
  const [name, setName] = useState('');
  const [rule, setRule] = useState<ScoreRule>('high');
  const [editing, setEditing] = useState<string>();
  const stats = new Map(titleStats(nights, titles).map((s) => [s.id, s]));
  const sorted = [...titles].sort((a, b) => (stats.get(b.id)?.plays ?? 0) - (stats.get(a.id)?.plays ?? 0) || a.name.localeCompare(b.name));

  const add = async () => {
    const n = name.trim();
    if (!n || titles.some((t) => t.name.toLowerCase() === n.toLowerCase())) return;
    const now = new Date().toISOString();
    await onSave({ id: newId(), name: n, rule, createdAt: now, updatedAt: now });
    setName('');
  };

  return (
    <>
      <GamesTabs active="titles" />
      <form
        className="game-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a game (Catan, Uno…)" aria-label="Game name" />
        <RuleSelect value={rule} onChange={setRule} />
        <button className="btn btn-primary" disabled={!name.trim()}>
          Add
        </button>
      </form>
      {sorted.length === 0 && <p className="muted">Add the games you play, and say whether the highest or lowest score wins.</p>}
      <ul className="game-list">
        {sorted.map((t) => {
          const s = stats.get(t.id);
          return (
            <li key={t.id}>
              <button className="game-row" onClick={() => setEditing(editing === t.id ? undefined : t.id)} aria-expanded={editing === t.id}>
                <strong>{t.name}</strong>
                <span className="muted small">
                  {s ? `${s.plays} ${s.plays === 1 ? 'play' : 'plays'} · last ${shortDate(s.lastPlayed)}` : 'Not played yet'} · {RULE_LABELS[t.rule]}
                </span>
              </button>
              {editing === t.id && (
                <div className="game-add">
                  <input
                    defaultValue={t.name}
                    aria-label="Game name"
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && onSave({ ...t, name: e.target.value.trim(), updatedAt: new Date().toISOString() })}
                  />
                  <RuleSelect value={t.rule} onChange={(r) => onSave({ ...t, rule: r, updatedAt: new Date().toISOString() })} />
                  <div className="chips">
                    <button type="button" className="chip" aria-pressed={titleHasColors(t)} onClick={() => onSave({ ...t, colors: !titleHasColors(t), updatedAt: new Date().toISOString() })}>
                      Player colors
                    </button>
                    <button type="button" className="chip" aria-pressed={titleHasOrder(t)} onClick={() => onSave({ ...t, orderMatters: !titleHasOrder(t), updatedAt: new Date().toISOString() })}>
                      Turn order matters
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
