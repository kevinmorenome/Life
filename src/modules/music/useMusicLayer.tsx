import { useMemo } from 'react';
import { MusicIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import type { CalendarLayer } from '../types';
import { byDate, duration } from './music';
import type { MusicDay } from './types';

/** stats.fm listening on the shared calendar: a mark on each day and a summary on the day screen. */
export function useMusicCalendarLayer(): CalendarLayer {
  const { items } = useCollection<MusicDay>('musicdays');
  const days = useMemo(() => byDate(items), [items]);

  return {
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const d = days.get(date);
      if (!d || d.plays === 0) return null;
      return { tone: 'music', icon: <MusicIcon />, label: duration(d.ms), tiles: d.topTracks.slice(0, 3).map((t) => t.name).filter(Boolean) };
    },
    daySection(date) {
      const d = days.get(date);
      if (!d || d.plays === 0) return null;
      return (
        <section className="checkins-day">
          <h2>Listened</h2>
          <p className="small">
            <strong>{duration(d.ms)}</strong> · {d.plays} {d.plays === 1 ? 'play' : 'plays'} · {d.artists} {d.artists === 1 ? 'artist' : 'artists'}
          </p>
          <ul>
            {d.topTracks.map((t) => (
              <li key={t.id}>
                <strong>{t.name}</strong>
                {t.artist && <span className="muted small"> {t.artist}</span>}
                {t.plays > 1 && <span className="muted small"> · {t.plays}×</span>}
              </li>
            ))}
          </ul>
        </section>
      );
    },
  };
}
