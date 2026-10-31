import { DiceIcon } from '../../icons';
import type { LifeModule } from '../types';
import { GamesRoot } from './GamesRoot';
import { GamesStatsRoute } from './GamesStatsRoute';
import { useGamesCalendarLayer } from './useGamesLayer';

export const gamesModule: LifeModule = {
  id: 'games',
  title: 'Games',
  icon: '🎲',
  description: 'Game nights: who played, scores, winners, and the leaderboard.',
  // Has its own tab in the bottom bar.
  listed: false,
  render: (subroute) => <GamesRoot subroute={subroute} />,
  actions: [{ label: 'New game night', icon: <DiceIcon />, path: () => '/games/new' }],
  calendarLayer: useGamesCalendarLayer,
  stats: { label: 'Games', render: () => <GamesStatsRoute /> },
  // Forms have their own bottom actions.
  hideNav: ([first, second, third]) => first === 'new' || (first === 'night' && !!second && !!third),
};
