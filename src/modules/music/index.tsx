import type { LifeModule } from '../types';
import { MusicStatsRoute } from './MusicStatsRoute';
import { useMusicCalendarLayer } from './useMusicLayer';

// stats.fm listening has no pages of its own: the Worker condenses it into one record per day
// (Settings connects the account), shown on the calendar and in Stats → Music.
export const musicModule: LifeModule = {
  id: 'music',
  title: 'Music',
  icon: '🎧',
  description: 'What you listened to, from stats.fm.',
  listed: false,
  render: () => null,
  actions: [],
  calendarLayer: useMusicCalendarLayer,
  stats: { label: 'Music', render: () => <MusicStatsRoute /> },
};
