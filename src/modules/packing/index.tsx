import { HangerIcon, PlusIcon, SuitcaseIcon } from '../../icons';
import type { LifeModule } from '../types';
import { PackingRoot } from './PackingRoot';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const packingModule: LifeModule = {
  id: 'packing',
  title: 'Packing',
  icon: '🧳',
  description: 'Plan outfits for a trip and check off what’s in the bag.',
  render: (subroute) => <PackingRoot subroute={subroute} />,
  tabs: [
    { id: 'trips', label: 'Trips', icon: <SuitcaseIcon />, path: '/packing', matches: () => true },
    // A way back to the wardrobe, which the bar would otherwise lose.
    { id: 'closet', label: 'Closet', icon: <HangerIcon />, path: '/clothes', matches: () => false },
  ],
  actions: [{ label: 'New trip', icon: <PlusIcon />, path: () => '/packing/new' }],
  // Forms and pickers have their own bottom actions.
  hideNav: ([first, second, third]) =>
    first === 'new' || second === 'edit' || second === 'items' || (second === 'day' && DATE.test(third ?? '')),
};
