import { CheckIcon, PlusIcon, ShirtIcon } from '../../icons';
import type { LifeModule } from '../types';
import { ClothesRoot } from './ClothesRoot';
import { ClothesStatsRoute } from './ClothesStatsRoute';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const clothesModule: LifeModule = {
  id: 'clothes',
  title: 'Clothes',
  icon: '👕',
  description: 'Your wardrobe, what you wear, and what it costs per wear.',
  render: (subroute) => <ClothesRoot subroute={subroute} />,
  stats: { label: 'Clothes', render: ([tab]) => <ClothesStatsRoute tab={tab} /> },
  actions: [
    { label: 'Log what I wore today', icon: <CheckIcon />, path: () => '/clothes/today' },
    { label: 'Add an item', icon: <PlusIcon />, path: () => '/clothes/new' },
    { label: 'New outfit', icon: <ShirtIcon />, path: () => '/clothes/outfits/new' },
  ],
  // Forms and pickers have their own sticky Save/Cancel at the bottom.
  hideNav: ([first, second, third]) =>
    second === 'edit' ||
    (first === 'outfits' && (second === 'new' || third === 'edit')) ||
    (first === 'calendar' && DATE.test(second ?? '') && (third === 'outfit' || third === 'items' || third === 'new-outfit')),
};
