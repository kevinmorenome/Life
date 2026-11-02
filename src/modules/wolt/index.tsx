import type { LifeModule } from '../types';
import { useWoltCalendarLayer } from './useWoltLayer';
import { WoltStatsRoute } from './WoltStatsRoute';

// Wolt orders have no pages of their own: Claude adds them from the receipt emails (`add_wolt_orders`),
// they show on the calendar and in Stats → Wolt.
export const woltModule: LifeModule = {
  id: 'wolt',
  title: 'Wolt',
  icon: '🛵',
  description: 'Food deliveries from your Wolt receipt emails.',
  listed: false,
  render: () => null,
  actions: [],
  calendarLayer: useWoltCalendarLayer,
  stats: { label: 'Wolt', render: () => <WoltStatsRoute /> },
};
