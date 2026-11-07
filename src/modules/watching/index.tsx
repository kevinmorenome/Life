import type { LifeModule } from '../types';
import { useWatchedCalendarLayer } from './useWatchedLayer';
import { WatchingStatsRoute } from './WatchingStatsRoute';

// Trakt plays have no pages of their own: the Worker pulls them (Settings connects the account),
// they show on the calendar and in Stats → Watching.
export const watchingModule: LifeModule = {
  id: 'watching',
  title: 'Watching',
  icon: '🎬',
  description: 'Movies and episodes you watched, from Trakt.',
  listed: false,
  render: () => null,
  actions: [],
  calendarLayer: useWatchedCalendarLayer,
  stats: { label: 'Watching', render: () => <WatchingStatsRoute /> },
};
