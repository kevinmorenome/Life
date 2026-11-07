import { BuildingIcon } from '../../icons';
import { today } from '../../lib/format';
import type { LifeModule } from '../types';
import { useWorkCalendarLayer } from './useWorkLayer';
import { WorkStatsRoute } from './WorkStatsRoute';

// Work has no pages of its own: days live on the calendar and the numbers in Stats.
export const workModule: LifeModule = {
  id: 'work',
  title: 'Work',
  icon: '🏢',
  description: 'Office and home days, how often you’re in, and when you arrive and leave.',
  listed: false,
  render: () => null,
  actions: [{ label: 'Office or home today', icon: <BuildingIcon />, path: () => `/calendar/${today()}` }],
  calendarLayer: useWorkCalendarLayer,
  stats: { label: 'Work', render: ([tab]) => <WorkStatsRoute tab={tab} /> },
};
