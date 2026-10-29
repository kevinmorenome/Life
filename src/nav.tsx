import type { ReactNode } from 'react';
import { CalendarIcon, ChartIcon, HangerIcon, MoreIcon } from './icons';

/** A destination in the bottom tab bar. The bar belongs to the app; modules only add ＋ menu entries. */
export interface AppTab {
  id: 'calendar' | 'closet' | 'stats' | 'more';
  label: string;
  icon: ReactNode;
  path: string;
}

export const APP_TABS: AppTab[] = [
  { id: 'calendar', label: 'Calendar', icon: <CalendarIcon />, path: '/calendar' },
  { id: 'closet', label: 'Closet', icon: <HangerIcon />, path: '/clothes' },
  { id: 'stats', label: 'Stats', icon: <ChartIcon />, path: '/stats' },
  { id: 'more', label: 'More', icon: <MoreIcon />, path: '/more' },
];

/** Which tab a route belongs to: everything outside the three main areas lives under More. */
export function activeTab(route: string[]): AppTab['id'] {
  const [a, b] = route;
  if (!a || a === 'calendar' || (a === 'clothes' && b === 'today')) return 'calendar';
  if (a === 'clothes') return 'closet';
  if (a === 'stats') return 'stats';
  return 'more';
}
