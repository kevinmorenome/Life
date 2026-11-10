import type { LifeModule } from '../types';

// Recipe Book: your own dishes, checked against the food stock. Screens come in the next issues (#204 onward); for now
// the module only owns its stores (`recipes`, `substitutions`).
export const recipesModule: LifeModule = {
  id: 'recipes',
  title: 'Recipes',
  icon: '🍳',
  description: 'Your own dishes, and what you can cook from what you have.',
  listed: false,
  render: () => null,
  actions: [],
};
