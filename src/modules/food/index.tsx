import { CartIcon } from '../../icons';
import type { LifeModule } from '../types';
import { FoodRoot } from './FoodRoot';

export const foodModule: LifeModule = {
  id: 'food',
  title: 'Food',
  icon: '🛒',
  description: 'Grocery receipts: what you bought, where, and what it cost.',
  render: (subroute) => <FoodRoot subroute={subroute} />,
  // Receipts also come in through Claude (add_grocery_receipt).
  actions: [{ label: 'Add receipt', icon: <CartIcon />, path: () => '/food/new' }],
  // The form has its own bottom actions.
  hideNav: ([first, second, third]) => first === 'new' || (first === 'receipt' && !!second && third === 'edit'),
};
