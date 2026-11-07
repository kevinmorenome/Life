import { shortDate } from '../../lib/format';
import { href } from '../../lib/router';
import { PlusIcon } from '../../icons';
import { GamesTabs } from './GamesTabs';
import { nightChampion } from './games';
import type { GameNight, GameTitle, Player } from './types';

export function NightList({ nights, players, titles }: { nights: GameNight[]; players: Player[]; titles: GameTitle[] }) {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const sorted = [...nights].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <GamesTabs active="nights" />
      {sorted.length === 0 && (
        <div className="empty">
          <p className="muted">No game nights yet. Start one, pick who’s playing, then log each game as you finish it.</p>
        </div>
      )}
      <ul className="game-list">
        {sorted.map((n) => {
          const champ = nightChampion(n);
          const played = [...new Set(n.matches.map((m) => titles.find((t) => t.id === m.titleId)?.name).filter(Boolean))];
          return (
            <li key={n.id}>
              <a className="game-row" href={href(`/games/night/${n.id}`)}>
                <strong>{shortDate(n.date)}</strong>
                <span className="muted small">
                  {[n.location, `${n.matches.length} ${n.matches.length === 1 ? 'game' : 'games'}`, n.playerIds.map(name).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {played.length > 0 && <span className="muted small">{played.join(', ')}</span>}
                {champ && (
                  <span className="game-champ">
                    🏆 {name(champ.playerId)} · {champ.wins} {champ.wins === 1 ? 'win' : 'wins'}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
      <a className="btn btn-primary game-new" href={href('/games/new')}>
        <PlusIcon /> New game night
      </a>
    </>
  );
}
