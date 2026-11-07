import type { LifeModule } from '../types';
import { PlacesStatsRoute } from './PlacesStatsRoute';
import { useCheckinsCalendarLayer } from './useCheckinsLayer';

// Swarm check-ins have no pages of their own: they show on the calendar, and Settings connects the account.
export const checkinsModule: LifeModule = {
  id: 'checkins',
  title: 'Places',
  icon: '📍',
  description: 'Where you checked in on Swarm.',
  listed: false,
  render: () => null,
  actions: [],
  calendarLayer: useCheckinsCalendarLayer,
  stats: { label: 'Places', render: ([tab]) => <PlacesStatsRoute tab={tab} /> },
};
