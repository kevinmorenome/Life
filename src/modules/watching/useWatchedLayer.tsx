import { useMemo } from 'react';
import { DayWidget } from '../../DayWidget';
import { FilmIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import type { CalendarLayer } from '../types';
import type { Play } from './types';
import { RemovePlayButton } from './RemovePlay';
import { byDate, dayLabel, dayTitles, episodeCode, when } from './watched';

/** Trakt plays on the shared calendar: a mark on each day and the list on the day screen. */
export function useWatchedCalendarLayer(): CalendarLayer {
  const { items } = useCollection<Play>('watched');
  const days = useMemo(() => byDate(items), [items]);

  return {
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      return { tone: 'watch', icon: <FilmIcon />, label: dayLabel(list), tiles: dayTitles(list) };
    },
    daySection(date) {
      const list = days.get(date);
      if (!list) return null;
      return (
        <DayWidget id="watched" title="Watched" icon={<FilmIcon />} tone="watch" badge={list.length > 1 ? list.length : undefined} summary={dayTitles(list).join(', ')}>
          <ul className="widget-list">
            {list.map((p) => (
              <li key={p.id} className="watch-day-play">
                <div>
                  <strong>{p.title}</strong>
                  <div className="muted small">
                    {[when(p).time, p.kind === 'episode' ? [episodeCode(p), p.episodeTitle].filter(Boolean).join(' ') : undefined].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <RemovePlayButton play={p} />
              </li>
            ))}
          </ul>
        </DayWidget>
      );
    },
  };
}
