import { useMemo } from 'react';
import { useSettings } from '../../lib/settings';
import { useCollection } from '../../lib/useCollection';
import { StatsView } from './StatsView';
import { DEFAULT_EXTENDED, DEFAULT_TARGET, type WorkDay, type WorkEvent } from './types';
import { buildDays } from './work';

export function WorkStatsRoute({ tab }: { tab?: string }) {
  const days = useCollection<WorkDay>('workdays');
  const events = useCollection<WorkEvent>('workevents');
  const { settings } = useSettings();
  const infos = useMemo(() => buildDays(days.items, events.items), [days.items, events.items]);
  if (days.loading || events.loading) return <p className="muted">Loading…</p>;
  return (
    <StatsView
      infos={infos}
      tab={tab}
      target={{
        days: settings.workTarget ?? DEFAULT_TARGET,
        kind: settings.workTargetKind ?? 'max-home',
        extended: settings.workExtended ?? DEFAULT_EXTENDED,
      }}
    />
  );
}
