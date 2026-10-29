import { useMemo } from 'react';
import { today } from '../../lib/format';
import { useSettings } from '../../lib/settings';
import { useCollection } from '../../lib/useCollection';
import type { CalendarLayer } from '../types';
import { TargetCard, type Target } from './TargetCard';
import { DEFAULT_EXTENDED, DEFAULT_TARGET, type WorkDay, type WorkEvent } from './types';
import { STATUS_ICONS, STATUS_LABELS, WorkDaySection } from './WorkDaySection';
import { buildDays, monthSummary } from './work';

/** Office, home and days off on the shared calendar. A hook: it loads its own data. */
export function useWorkCalendarLayer(): CalendarLayer {
  const days = useCollection<WorkDay>('workdays');
  const events = useCollection<WorkEvent>('workevents');
  const { settings } = useSettings();
  const infos = useMemo(() => buildDays(days.items, events.items), [days.items, events.items]);
  const target: Target = {
    days: settings.workTarget ?? DEFAULT_TARGET,
    kind: settings.workTargetKind ?? 'max-home',
    extended: settings.workExtended ?? DEFAULT_EXTENDED,
  };

  return {
    mark(date) {
      const info = infos.get(date);
      if (!info?.status) return null;
      return {
        tone: info.status,
        icon: STATUS_ICONS[info.status],
        label: STATUS_LABELS[info.status],
        detail: info.arrive || info.leave ? `${info.arrive ?? '?'} – ${info.leave ?? '?'}` : undefined,
      };
    },
    header(month) {
      const now = today();
      return <TargetCard summary={monthSummary(month, infos, now)} target={target} past={month < now.slice(0, 7)} />;
    },
    daySection(date) {
      return <WorkDaySection date={date} info={infos.get(date)} onSave={days.save} onClear={days.remove} />;
    },
  };
}
