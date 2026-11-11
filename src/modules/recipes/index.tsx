import { PlusIcon } from '../../icons';
import type { LifeModule } from '../types';
import { RecipesRoot } from './RecipesRoot';

// Recipe Book: your own dishes, checked against the food stock (plan: issues #203–#213). It lives under the Food tab
// (Recipes is the last of the Food sections), so it isn't listed in More.
export const recipesModule: LifeModule = {
  id: 'recipes',
  title: 'Recipes',
  icon: '🍳',
  description: 'Your own dishes, and what you can cook from what you have.',
  listed: false,
  render: (subroute) => <RecipesRoot subroute={subroute} />,
  actions: [{ label: 'New recipe', icon: <PlusIcon />, path: () => '/recipes/new' }],
  // The form has its own bottom actions.
  hideNav: ([first, second]) => first === 'new' || second === 'edit' || second === 'cook',
};
