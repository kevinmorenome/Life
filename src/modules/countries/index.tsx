import type { LifeModule } from '../types';

// Countries have no pages of their own: Stats → Places → Countries shows the map and list. The visits come from Swarm
// check-ins (by country) plus the `countries` store for ones Swarm doesn't know about.
export const countriesModule: LifeModule = {
  id: 'countries',
  title: 'Countries',
  icon: '🌍',
  description: 'Countries you have been to.',
  listed: false,
  render: () => null,
  actions: [],
};
