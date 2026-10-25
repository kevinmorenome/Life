import { CalendarIcon, ChartIcon, CheckIcon, HangerIcon, PlusIcon, ShirtIcon } from '../../icons';
import { today } from '../../lib/format';
import type { LifeModule } from '../types';
import { ClothesRoot } from './ClothesRoot';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const clothesModule: LifeModule = {
  id: 'clothes',
  title: 'Clothes',
  icon: '👕',
  description: 'Your wardrobe, what you wear, and what it costs per wear.',
  render: (subroute) => <ClothesRoot subroute={subroute} />,
  tabs: [
    {
      id: 'closet',
      label: 'Closet',
      icon: <HangerIcon />,
      path: '/clothes',
      matches: ([first]) => !first || !['outfits', 'calendar', 'stats'].includes(first),
    },
    {
      id: 'outfits',
      label: 'Outfits',
      icon: <ShirtIcon />,
      path: '/clothes/outfits',
      matches: ([first]) => first === 'outfits',
    },
    {
      id: 'calendar',
      label: 'Calendar',
      icon: <CalendarIcon />,
      path: '/clothes/calendar',
      matches: ([first]) => first === 'calendar',
    },
    { id: 'stats', label: 'Stats', icon: <ChartIcon />, path: '/clothes/stats', matches: ([first]) => first === 'stats' },
  ],
  actions: [
    { label: 'Log what I wore today', icon: <CheckIcon />, path: () => `/clothes/calendar/${today()}` },
    { label: 'Add an item', icon: <PlusIcon />, path: () => '/clothes/new' },
    { label: 'New outfit', icon: <ShirtIcon />, path: () => '/clothes/outfits/new' },
  ],
  // Forms and pickers have their own sticky Save/Cancel at the bottom.
  hideNav: ([first, second, third]) =>
    first === 'new' ||
    second === 'edit' ||
    (first === 'outfits' && (second === 'new' || third === 'edit')) ||
    (first === 'calendar' && DATE.test(second ?? '') && (third === 'outfit' || third === 'items')),
};
