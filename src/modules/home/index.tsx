import { HomeIcon } from '../../icons';
import type { LifeModule } from '../types';
import { HomeRoot } from './HomeRoot';
import { HomeStatsRoute } from './HomeStatsRoute';
import { useHomeCalendarLayer } from './useHomeLayer';

// Water and gas bills with their consumption and costs. Claude adds them from a photo or PDF (`add_utility_bills`); the app marks them
// paid, shows them on the day they were paid (no calendar mark) and in Stats → Home.
export const homeModule: LifeModule = {
  id: 'home',
  title: 'Home bills',
  icon: <HomeIcon />,
  description: 'Water and gas bills: what they cost, how much you used and who paid.',
  render: (subroute) => <HomeRoot subroute={subroute} />,
  actions: [{ label: 'Add a bill', icon: <HomeIcon />, path: () => '/home/new' }],
  calendarLayer: useHomeCalendarLayer,
  stats: { label: 'Home', render: () => <HomeStatsRoute /> },
};
