import { DiceIcon } from '../../icons';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import type { CalendarLayer } from '../types';
import { nightChampion } from './games';
import type { GameNight, GameTitle, Player } from './types';

/** Game nights on the shared calendar: a dice badge on the day and the night's games on the day screen. */
export function useGamesCalendarLayer(): CalendarLayer {
  const nights = useCollection<GameNight>('gamenights');
  const titles = useCollection<GameTitle>('gametitles');
  const players = useCollection<Player>('players');
  const byDate = new Map<string, GameNight[]>();
  for (const n of nights.items) byDate.set(n.date, [...(byDate.get(n.date) ?? []), n]);
  const titleName = (id: string) => titles.items.find((t) => t.id === id)?.name ?? 'Game';
  const playerName = (id: string) => players.items.find((p) => p.id === id)?.name ?? '?';

  return {
    earliest: nights.items.length ? nights.items.map((n) => n.date).sort()[0] : undefined,
    mark(date) {
      const day = byDate.get(date);
      if (!day) return null;
      const games = day.reduce((n, x) => n + x.matches.length, 0);
      return {
        tone: 'games',
        icon: <DiceIcon />,
        label: 'Game night',
        detail: `${games} ${games === 1 ? 'game' : 'games'}`,
        tiles: day.flatMap((n) => n.matches.map((m) => titleName(m.titleId))).slice(0, 4),
      };
    },
    daySection(date) {
      const day = byDate.get(date);
      if (!day) return null;
      return (
        <section>
          <h2>Game night</h2>
          <ul className="game-list">
            {day.map((n) => {
              const champ = nightChampion(n);
              return (
                <li key={n.id}>
                  <a className="game-row" href={href(`/games/night/${n.id}`)}>
                    <strong>{[n.location, `${n.matches.length} ${n.matches.length === 1 ? 'game' : 'games'}`].filter(Boolean).join(' · ')}</strong>
                    <span className="muted small">{n.matches.map((m) => titleName(m.titleId)).join(', ') || 'No games logged yet'}</span>
                    {champ && <span className="game-champ">🏆 {playerName(champ.playerId)}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      );
    },
  };
}
