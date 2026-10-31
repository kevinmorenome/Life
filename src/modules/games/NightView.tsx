import { EditIcon, PlusIcon } from '../../icons';
import { shortDate } from '../../lib/format';
import { href } from '../../lib/router';
import type { GameNight, GameTitle, Player } from './types';

/** The games of one night, in the order they were played. */
export function NightView({ night, players, titles }: { night: GameNight; players: Player[]; titles: GameTitle[] }) {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  return (
    <>
      <div className="game-head">
        <div>
          <h1 className="page-title">{shortDate(night.date)}</h1>
          <p className="muted small">{[night.location, night.playerIds.map(name).join(', ')].filter(Boolean).join(' · ')}</p>
          {night.notes && <p className="small">{night.notes}</p>}
        </div>
        <a className="icon-btn" href={href(`/games/night/${night.id}/edit`)} aria-label="Edit game night">
          <EditIcon />
        </a>
      </div>
      {night.matches.length === 0 && <p className="muted">No games yet. Tap + to log the first one.</p>}
      <ul className="game-list">
        {night.matches.map((m) => (
          <li key={m.id}>
            <a className="game-row" href={href(`/games/night/${night.id}/${m.live ? 'play' : 'match'}/${m.id}`)}>
              <strong>{titles.find((t) => t.id === m.titleId)?.name ?? 'Game'}</strong>
              <span className="game-champ">{m.live ? '🎲 In progress' : m.winnerIds.length ? `🏆 ${m.winnerIds.map(name).join(' & ')}` : 'No winner set'}</span>
              <span className="muted small">
                {m.rounds?.length ? `${m.rounds.length} rounds · ` : ''}{m.playerIds.map((id) => (m.scores[id] !== undefined ? `${name(id)} ${m.scores[id]}` : name(id))).join(' · ')}
              </span>
              {m.note && <span className="muted small">{m.note}</span>}
            </a>
          </li>
        ))}
      </ul>
      <a className="btn btn-primary game-new" href={href(`/games/night/${night.id}/add`)}>
        <PlusIcon /> Log a game
      </a>
    </>
  );
}
