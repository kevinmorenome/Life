import { useCollection } from '../../lib/useCollection';
import { MatchForm } from './MatchForm';
import { NightForm } from './NightForm';
import { NightList } from './NightList';
import { NightView } from './NightView';
import { RosterTab } from './RosterTab';
import { TitlesTab } from './TitlesTab';
import type { GameNight, GameTitle, Player } from './types';

export function GamesRoot({ subroute }: { subroute: string[] }) {
  const players = useCollection<Player>('players');
  const titles = useCollection<GameTitle>('gametitles');
  const nights = useCollection<GameNight>('gamenights');
  const [first, second, third, fourth] = subroute;

  if (players.loading || titles.loading || nights.loading) return <p className="muted">Loading…</p>;

  if (first === 'players') return <RosterTab players={players.items} nights={nights.items} onSave={players.save} />;
  if (first === 'titles') return <TitlesTab titles={titles.items} nights={nights.items} onSave={titles.save} />;
  if (first === 'new') return <NightForm players={players.items} onSave={nights.save} onSavePlayer={players.save} />;
  if (first === 'night' && second) {
    const night = nights.items.find((n) => n.id === second);
    if (!night) return <p className="muted">That game night doesn’t exist anymore.</p>;
    if (third === 'edit') return <NightForm existing={night} players={players.items} onSave={nights.save} onSavePlayer={players.save} onDelete={nights.remove} />;
    if (third === 'add' || third === 'match') {
      const existing = third === 'match' ? night.matches.find((m) => m.id === fourth) : undefined;
      if (third === 'match' && !existing) return <p className="muted">That game doesn’t exist anymore.</p>;
      return <MatchForm night={night} existing={existing} players={players.items} titles={titles.items} onSave={nights.save} onSaveTitle={titles.save} />;
    }
    return <NightView night={night} players={players.items} titles={titles.items} />;
  }
  return <NightList nights={nights.items} players={players.items} titles={titles.items} />;
}
