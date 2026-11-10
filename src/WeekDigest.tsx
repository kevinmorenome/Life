import { useMemo } from 'react';
import { addDays, wearsByDay } from './modules/clothes/calendar';
import { Section } from './modules/clothes/charts';
import type { ClothingItem, Outfit } from './modules/clothes/types';
import { buildDigest, type DigestExtras, type WornNames } from './modules/checkins/digest';
import { DOT_NAMES, dayDots, dotColor, weekHighlights, weekTiles } from './modules/checkins/weekView';
import type { Checkin } from './modules/checkins/types';
import type { GameNight, GameTitle, Match } from './modules/games/types';
import type { MusicDay } from './modules/music/types';
import type { Ride } from './modules/rides/types';
import type { FoodReceipt } from './modules/food/types';
import { isWoltTakeoutReceipt } from './modules/wolt/fromReceipts';
import { useTakeoutOrders } from './modules/wolt/useTakeoutOrders';
import type { Play } from './modules/watching/types';
import { when } from './modules/watching/watched';
import { buildDays } from './modules/work/work';
import type { WorkDay, WorkEvent } from './modules/work/types';
import { money, shortDate, today } from './lib/format';
import { href } from './lib/router';
import { useCollection } from './lib/useCollection';

const local = (date: string) => new Date(`${date}T12:00:00`);
const weekday = (date: string) => local(date).toLocaleDateString(undefined, { weekday: 'short' });

/**
 * The More tab's "This week": the last 7 days as a strip you can tap into (a dot per kind of thing that happened),
 * the headline numbers against the week before, and a few sentences about what stood out.
 * The same digest Claude's `weekly_digest` tool writes from.
 */
export function WeekDigest() {
  const checkins = useCollection<Checkin>('checkins').items;
  const clothes = useCollection<ClothingItem>('clothes').items;
  const outfits = useCollection<Outfit>('outfits').items;
  const workdays = useCollection<WorkDay>('workdays').items;
  const workevents = useCollection<WorkEvent>('workevents').items;
  const takeout = useTakeoutOrders().items;
  const rides = useCollection<Ride>('rides').items;
  const receipts = useCollection<FoodReceipt>('foodreceipts').items;
  const plays = useCollection<Play>('watched').items;
  const music = useCollection<MusicDay>('musicdays').items;
  const nights = useCollection<GameNight>('gamenights').items;
  const titles = useCollection<GameTitle>('gametitles').items;
  const end = today();

  const view = useMemo(() => {
    const worn = new Map<string, WornNames>();
    for (const [date, w] of wearsByDay(clothes, outfits)) worn.set(date, { outfits: w.outfits.map((o) => o.name || 'Outfit'), items: w.items.map((i) => i.name) });
    const days = buildDays(workdays, workevents);
    const title = new Map(titles.map((t) => [t.id, t.name]));
    const extras: DigestExtras = {
      takeout: takeout.map((o) => ({ date: o.date, place: o.restaurant, total: o.total, currency: o.currency })),
      rides: rides.map((r) => ({ date: r.date, fare: r.fare, currency: r.currency })),
      groceries: receipts.filter((r) => !isWoltTakeoutReceipt(r)).map((r) => ({ date: r.date, store: r.store, total: r.total ?? r.lines.reduce((a, l) => a + l.paid, 0) })),
      watched: plays.map((p) => ({ date: when(p).date, title: p.title, kind: p.kind })),
      music: music.map((m) => ({ date: m.date, plays: m.plays, ms: m.ms, artists: m.topArtists.map((a) => ({ name: a.name, plays: a.plays })) })),
      games: nights.flatMap((n) => n.matches.filter((m: Match) => !m.live).map((m) => ({ date: n.date, game: title.get(m.titleId) ?? 'a game' }))),
    };
    const digestFor = (start: string, to: string) => buildDigest({ checkins, worn, days, start, end: to, ...extras });
    const start = addDays(end, -6);
    const cur = digestFor(start, end);
    const prev = digestFor(addDays(start, -7), addDays(start, -1));
    const kinds = new Map<string, { tone: string }>();
    for (const d of cur.daily) for (const dot of dayDots(d)) kinds.set(dot.key, { tone: dot.tone });
    return { cur, tiles: weekTiles(cur, prev, money), highlights: weekHighlights(cur, weekday), kinds: [...kinds] };
  }, [checkins, clothes, outfits, workdays, workevents, takeout, rides, receipts, plays, music, nights, titles, end]);

  const { cur, tiles, highlights, kinds } = view;
  // A week with nothing in it has nothing to show.
  if (kinds.length === 0) return null;

  return (
    <Section title="This week" note={`${shortDate(cur.period.start)} – ${shortDate(cur.period.end)}. Tap a day to open it.`}>
      <ol className="week-strip">
        {cur.daily.map((d) => {
          const dots = dayDots(d);
          const label = `${local(d.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}: ${dots.length ? dots.map((x) => x.label).join(', ') : 'nothing logged'}`;
          return (
            <li key={d.date}>
              <a className={`week-day${d.date === end ? ' is-today' : ''}`} href={href(`/calendar/${d.date}`)} aria-label={label}>
                <span className="week-dow">{weekday(d.date)}</span>
                <span className="week-num">{Number(d.date.slice(8))}</span>
                <span className="week-dots" aria-hidden>
                  {dots.map((x) => (
                    <i key={x.key} style={{ background: dotColor(x.tone) }} />
                  ))}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      <ul className="week-legend">
        {kinds.map(([key, k]) => (
          <li key={key}>
            <i style={{ background: dotColor(k.tone) }} aria-hidden /> {DOT_NAMES[key] ?? key}
          </li>
        ))}
      </ul>

      {tiles.length > 0 && (
        <div className="week-tiles">
          {tiles.map((t) => (
            <div key={t.key} className="week-tile">
              <span className="stat-value">{t.value}</span>
              <span className="stat-label">{t.label}</span>
              {t.delta && <span className="week-delta">{t.delta}</span>}
            </div>
          ))}
        </div>
      )}

      {highlights.length > 0 && (
        <ul className="digest-list">
          {highlights.map((h) => (
            <li key={h.key}>{h.date ? <a className="week-link" href={href(`/calendar/${h.date}`)}>{h.text}</a> : <span>{h.text}</span>}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}
