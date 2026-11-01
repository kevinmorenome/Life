import { useEffect, useState } from 'react';
import { CheckIcon, UndoIcon } from '../../icons';
import { DOMINO_KEYS, KEY_COLORS, PIPS } from './domino';

/** A key with the pips of that number, like the face of a domino half. */
function Face({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden>
      {PIPS[n].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={n > 9 ? 8 : n > 6 ? 10 : 12} fill={KEY_COLORS[n]} />
      ))}
    </svg>
  );
}

interface Props {
  player: string;
  /** What the score field holds now; new taps add to it. */
  start: number;
  onDone: (total: number) => void;
  onClose: () => void;
}

/** Adds up the pips of the tiles left in a hand: tap a number for each half, then Done puts the total in the field. */
export function DominoPad({ player, start, onDone, onClose }: Props) {
  const [taps, setTaps] = useState<number[]>([]);
  const [base, setBase] = useState(start);
  const total = base + taps.reduce((a, b) => a + b, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet domino-pad" role="dialog" aria-label={`Add up ${player}'s points`} onClick={(e) => e.stopPropagation()}>
        <div className="domino-head">
          <span className="muted small">{player}</span>
          <strong className="domino-total">{total}</strong>
          <span className="muted small domino-tape">{[...(base ? [base] : []), ...taps].join(' + ') || 'Tap the pips'}</span>
        </div>
        <div className="domino-keys">
          {DOMINO_KEYS.map((n) => (
            <button key={n} type="button" className="domino-key" aria-label={`Add ${n}`} onClick={() => setTaps((t) => [...t, n])}>
              <Face n={n} />
            </button>
          ))}
        </div>
        <div className="domino-actions">
          <button type="button" className="icon-btn" aria-label="Undo last" disabled={taps.length === 0} onClick={() => setTaps((t) => t.slice(0, -1))}>
            <UndoIcon />
          </button>
          <button type="button" className="btn btn-ghost" disabled={taps.length === 0 && base === 0} onClick={() => (setTaps([]), setBase(0))}>
            Clear
          </button>
          <button type="button" className="btn btn-primary domino-done" onClick={() => onDone(total)}>
            <CheckIcon /> Done
          </button>
        </div>
      </div>
    </div>
  );
}
