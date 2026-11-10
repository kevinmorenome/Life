import type { ReactNode } from 'react';
import { CalendarIcon, CartIcon, ChartIcon, DiceIcon, HangerIcon, MoreIcon, SuitcaseIcon } from './icons';

/** A destination in the bottom tab bar. The bar belongs to the app; modules only add ＋ menu entries. */
export interface AppTab {
  id: 'calendar' | 'closet' | 'food' | 'stats' | 'games' | 'trips' | 'more';
  label: string;
  icon: ReactNode;
  path: string;
}

export const APP_TABS: AppTab[] = [
  { id: 'calendar', label: 'Calendar', icon: <CalendarIcon />, path: '/calendar' },
  { id: 'closet', label: 'Closet', icon: <HangerIcon />, path: '/clothes' },
  { id: 'food', label: 'Food', icon: <CartIcon />, path: '/food' },
  { id: 'stats', label: 'Stats', icon: <ChartIcon />, path: '/stats' },
  { id: 'games', label: 'Games', icon: <DiceIcon />, path: '/games' },
  { id: 'trips', label: 'Trips', icon: <SuitcaseIcon />, path: '/trips' },
  { id: 'more', label: 'More', icon: <MoreIcon />, path: '/more' },
];

/** Which tab a route belongs to: everything outside the main areas lives under More. */
export function activeTab(route: string[]): AppTab['id'] {
  const [a, b] = route;
  if (!a || a === 'calendar' || (a === 'clothes' && b === 'today')) return 'calendar';
  if (a === 'clothes') return 'closet';
  if (a === 'games') return 'games';
  if (a === 'food') return 'food';
  if (a === 'trips') return 'trips';
  if (a === 'stats') return 'stats';
  return 'more';
}
