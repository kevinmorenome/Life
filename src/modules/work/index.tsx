import { BuildingIcon, CalendarIcon, ChartIcon, HangerIcon } from '../../icons';
import { today } from '../../lib/format';
import type { LifeModule } from '../types';
import { WorkRoot } from './WorkRoot';

export const workModule: LifeModule = {
  id: 'work',
  title: 'Office',
  icon: '🏢',
  description: 'Office and home days, how often you’re in, and when you arrive and leave.',
  render: (subroute) => <WorkRoot subroute={subroute} />,
  tabs: [
    {
      id: 'calendar',
      label: 'Calendar',
      icon: <CalendarIcon />,
      path: '/work',
      matches: ([first]) => first !== 'stats',
    },
    { id: 'stats', label: 'Stats', icon: <ChartIcon />, path: '/work/stats', matches: ([first]) => first === 'stats' },
    // A way back to the wardrobe, which the bar would otherwise lose.
    { id: 'closet', label: 'Closet', icon: <HangerIcon />, path: '/clothes', matches: () => false },
  ],
  actions: [{ label: 'Set today', icon: <BuildingIcon />, path: () => `/work/day/${today()}` }],
  // The day screen has its own back link and choices.
  hideNav: ([first]) => first === 'day',
};
