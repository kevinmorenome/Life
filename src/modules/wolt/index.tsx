import type { LifeModule } from '../types';
import { useWoltCalendarLayer } from './useWoltLayer';
import { WoltStatsRoute } from './WoltStatsRoute';

// Wolt orders have no pages of their own: Claude adds them from the receipt emails (`add_wolt_orders`),
// they show on the calendar and in Stats → Takeout. Wolt grocery orders are not takeout: they go to the food log.
export const woltModule: LifeModule = {
  id: 'wolt',
  title: 'Takeout',
  icon: '🛵',
  description: 'Takeout and restaurant deliveries ordered through Wolt.',
  listed: false,
  render: () => null,
  actions: [],
  calendarLayer: useWoltCalendarLayer,
  stats: { label: 'Takeout', render: () => <WoltStatsRoute /> },
};
