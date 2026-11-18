import { useMemo, useState } from 'react';
import { DayWidget } from '../../DayWidget';
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
        <DayWidget
          id="listened"
          title="Listened"
          icon={<MusicIcon />}
          tone="music"
          size="full"
          badge={duration(d.ms)}
          summary={`${d.plays} ${d.plays === 1 ? 'play' : 'plays'} · ${d.artists} ${d.artists === 1 ? 'artist' : 'artists'}`}
        >
          <ListenedTracks day={d} />
        </DayWidget>
      );
    },
  };
}

const SHOWN = 3;

/** The day's top tracks, three rows until you ask for the rest. */
function ListenedTracks({ day: d }: { day: MusicDay }) {
  const [all, setAll] = useState(false);
  const rows = all ? d.topTracks : d.topTracks.slice(0, SHOWN);
  return (
    <>
      <p className="muted small widget-line">
        {d.plays} {d.plays === 1 ? 'play' : 'plays'} · {d.artists} {d.artists === 1 ? 'artist' : 'artists'}
      </p>
      <ul className="widget-list">
        {rows.map((t) => (
          <li key={t.id} className="listen-row">
            <span className="listen-name">
              {t.name}
              {t.artist && <span className="muted small"> · {t.artist}</span>}
            </span>
            {t.plays > 1 && <span className="listen-count">{t.plays}×</span>}
          </li>
        ))}
      </ul>
      {d.topTracks.length > SHOWN && (
        <button type="button" className="widget-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `Show all ${d.topTracks.length}`}
        </button>
      )}
    </>
  );
}
