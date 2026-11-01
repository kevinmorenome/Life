import type { Standing } from './games';
import type { ScoreRule } from './types';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

interface Props {
  board: Standing[];
  rule: ScoreRule;
  started: boolean;
  name: (id: string) => string;
  /** Who won each round (highlights the points in the trail). Omit with `showTrail={false}` for single-score games. */
  wonBy?: string[][];
  showTrail?: boolean;
}

/** The leaderboard: position (👑 for the leader), name, recent round points, total and the gap to the player above. */
export function Scoreboard({ board, rule, started, name, wonBy = [], showTrail = true }: Props) {
  return (
    <ol className="scoreboard" aria-label="Scoreboard">
      {board.map((s) => (
        <li key={s.id} className={`score-row${started && s.position === 1 && rule !== 'manual' ? ' score-first' : ''}`}>
          <span className="score-pos" aria-label={`Position ${s.position}`}>
            {started && s.position === 1 && rule !== 'manual' ? '👑' : s.position}
          </span>
          <span className="score-who">
            <strong>{name(s.id)}</strong>
            {showTrail && (
              <span className="muted small score-trail">
                {!started
                  ? 'No rounds yet'
                  : s.trail.map((pts, r) => ({ pts, r, won: wonBy[r]?.includes(s.id) })).slice(-6).map(({ pts, r, won }, k) => (
                      <span key={r}>
                        {k > 0 && ' · '}
                        <span className={won ? 'won' : undefined} title={won ? `Won round ${r + 1}` : undefined}>
                          {fmt(pts)}
                        </span>
                      </span>
                    ))}
              </span>
            )}
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
  );
}
