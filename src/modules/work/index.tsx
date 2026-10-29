import { BuildingIcon } from '../../icons';
import { today } from '../../lib/format';
import type { LifeModule } from '../types';
import { useWorkCalendarLayer } from './useWorkLayer';
import { WorkStatsRoute } from './WorkStatsRoute';

// Office has no pages of its own: days live on the calendar and the numbers in Stats.
export const workModule: LifeModule = {
  id: 'work',
  title: 'Office',
  icon: '🏢',
  description: 'Office and home days, how often you’re in, and when you arrive and leave.',
  listed: false,
  render: () => null,
  actions: [{ label: 'Office or home today', icon: <BuildingIcon />, path: () => `/calendar/${today()}` }],
  calendarLayer: useWorkCalendarLayer,
  stats: { label: 'Office', render: () => <WorkStatsRoute /> },
};
