import { PlusIcon } from '../../icons';
import type { LifeModule } from '../types';
import { TripsRoot } from './TripsRoot';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const tripsModule: LifeModule = {
  id: 'trips',
  title: 'Trips',
  icon: '🧳',
  // Has its own tab in the bottom bar, so it isn't repeated in More.
  listed: false,
  description: 'Your trips: pack outfits and check off what’s in the bag. Itinerary comes later.',
  render: (subroute) => <TripsRoot subroute={subroute} />,
  actions: [{ label: 'New trip', icon: <PlusIcon />, path: () => '/trips/new' }],
  // Forms and pickers have their own bottom actions.
  hideNav: ([first, second, third]) =>
    first === 'new' || second === 'edit' || second === 'items' || (second === 'day' && DATE.test(third ?? '')),
};
