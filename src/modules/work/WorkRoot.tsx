import { useMemo } from 'react';
import { useCollection } from '../../lib/useCollection';
import { useSettings } from '../../lib/settings';
import { DayView } from './DayView';
import { MonthView } from './MonthView';
import { StatsView } from './StatsView';
import { DEFAULT_EXTENDED, DEFAULT_TARGET, type WorkDay, type WorkEvent } from './types';
import { buildDays } from './work';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

export function WorkRoot({ subroute }: { subroute: string[] }) {
  const days = useCollection<WorkDay>('workdays');
  const events = useCollection<WorkEvent>('workevents');
  const { settings } = useSettings();
  const infos = useMemo(() => buildDays(days.items, events.items), [days.items, events.items]);
  const [first, second] = subroute;

  if (days.loading || events.loading) return <p className="muted">Loading…</p>;

  const target = { days: settings.workTarget ?? DEFAULT_TARGET, kind: settings.workTargetKind ?? 'max-home', extended: settings.workExtended ?? DEFAULT_EXTENDED };
  if (first === 'day' && DATE.test(second ?? '')) {
    return <DayView date={second} info={infos.get(second)} onSave={days.save} onClear={days.remove} />;
  }
  if (first === 'stats') return <StatsView infos={infos} target={target} />;
  return <MonthView month={first === 'calendar' && MONTH.test(second ?? '') ? second : undefined} infos={infos} target={target} />;
}
