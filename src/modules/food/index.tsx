import type { LifeModule } from '../types';
import { FoodRoot } from './FoodRoot';

export const foodModule: LifeModule = {
  id: 'food',
  title: 'Food',
  icon: '🛒',
  description: 'Grocery receipts: what you bought, where, and what it cost.',
  render: (subroute) => <FoodRoot subroute={subroute} />,
  // Receipts come in through Claude (add_grocery_receipt), so there's nothing to add by hand yet.
  actions: [],
};
