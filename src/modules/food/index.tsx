import { CartIcon } from '../../icons';
import type { LifeModule } from '../types';
import { FoodRoot } from './FoodRoot';
import { FoodStatsRoute } from './FoodStatsRoute';
import { useFoodCalendarLayer } from './useFoodLayer';

export const foodModule: LifeModule = {
  id: 'food',
  title: 'Food',
  icon: '🛒',
  // Has its own tab in the bottom bar, so it isn't repeated in More.
  listed: false,
  description: 'Grocery receipts, stock, shopping list and food stats: what you bought, where, and what it cost.',
  render: (subroute) => <FoodRoot subroute={subroute} />,
  // Receipts also come in through Claude (add_grocery_receipt).
  actions: [{ label: 'Add receipt', icon: <CartIcon />, path: () => '/food/new' }],
  calendarLayer: useFoodCalendarLayer,
  stats: { label: 'Food', render: ([tab]) => <FoodStatsRoute tab={tab} /> },
  // The form has its own bottom actions.
  hideNav: ([first, second, third]) => first === 'new' || (first === 'receipt' && !!second && third === 'edit'),
};
