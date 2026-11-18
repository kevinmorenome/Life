import { BagIcon } from '../../icons';
import type { LifeModule } from '../types';
import { useWoltCalendarLayer } from './useWoltLayer';
import { TakeoutRoot } from './TakeoutRoot';
import { WoltStatsRoute } from './WoltStatsRoute';

// Takeout: What I eat (`#/wolt`, `#/wolt/venue/<name>`, from the item lines) is in More. Claude adds orders from the receipt emails (`add_wolt_orders`, `add_takeout_orders` for Bolt/Uber),
// they show on the calendar and in Stats → Takeout. Wolt grocery orders are not takeout: they go to the food log.
export const woltModule: LifeModule = {
  id: 'wolt',
  title: 'What I eat',
  icon: <BagIcon />,
  description: 'What you order for takeout (Wolt, Bolt Food, Uber Eats): top dishes, venues and what you liked.',
  render: (subroute) => <TakeoutRoot subroute={subroute} />,
  actions: [],
  calendarLayer: useWoltCalendarLayer,
  stats: { label: 'Takeout', render: () => <WoltStatsRoute /> },
};
