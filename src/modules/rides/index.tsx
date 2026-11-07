import type { LifeModule } from '../types';
import { RidesStatsRoute } from './RidesStatsRoute';
import { useRidesCalendarLayer } from './useRidesLayer';

// Rides have no pages of their own: Claude adds them from the Bolt / Uber receipt emails (`add_rides`),
// they show on the calendar and in Stats → Rides.
export const ridesModule: LifeModule = {
  id: 'rides',
  title: 'Rides',
  icon: '🚕',
  description: 'Bolt and Uber rides.',
  listed: false,
  render: () => null,
  actions: [],
  calendarLayer: useRidesCalendarLayer,
  stats: { label: 'Rides', render: () => <RidesStatsRoute /> },
};
