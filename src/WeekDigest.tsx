import { useMemo, type ReactNode } from 'react';
import { addDays, wearsByDay } from './modules/clothes/calendar';
import { Section } from './modules/clothes/charts';
import type { ClothingItem, Outfit } from './modules/clothes/types';
import { buildDigest, type WornNames } from './modules/checkins/digest';
import { digestLines } from './modules/checkins/digestLines';
import type { Checkin } from './modules/checkins/types';
import type { Match } from './modules/games/types';
import type { GameNight, GameTitle } from './modules/games/types';
import type { MusicDay } from './modules/music/types';
import type { Ride } from './modules/rides/types';
import type { FoodReceipt } from './modules/food/types';
import { isWoltTakeoutReceipt } from './modules/wolt/fromReceipts';
import { useTakeoutOrders } from './modules/wolt/useTakeoutOrders';
import type { Play } from './modules/watching/types';
import { when } from './modules/watching/watched';
import { buildDays } from './modules/work/work';
import type { WorkDay, WorkEvent } from './modules/work/types';
import { today } from './lib/format';
import { useCollection } from './lib/useCollection';

/** The More tab's "This week": the last 7 days across the app, the same digest Claude's `weekly_digest` tool writes from. */
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

  const lines = useMemo(() => {
    const worn = new Map<string, WornNames>();
    for (const [date, w] of wearsByDay(clothes, outfits)) worn.set(date, { outfits: w.outfits.map((o) => o.name || 'Outfit'), items: w.items.map((i) => i.name) });
    const title = new Map(titles.map((t) => [t.id, t.name]));
    const digest = buildDigest({
      checkins,
      worn,
      days: buildDays(workdays, workevents),
      start: addDays(end, -6),
      end,
      takeout: takeout.map((o) => ({ date: o.date, place: o.restaurant, total: o.total, currency: o.currency })),
      rides: rides.map((r) => ({ date: r.date, fare: r.fare, currency: r.currency })),
      groceries: receipts.filter((r) => !isWoltTakeoutReceipt(r)).map((r) => ({ date: r.date, store: r.store, total: r.total ?? r.lines.reduce((a, l) => a + l.paid, 0) })),
      watched: plays.map((p) => ({ date: when(p).date, title: p.title, kind: p.kind })),
      music: music.map((m) => ({ date: m.date, plays: m.plays, ms: m.ms, artists: m.topArtists.map((a) => ({ name: a.name, plays: a.plays })) })),
      games: nights.flatMap((n) => n.matches.filter((m: Match) => !m.live).map((m) => ({ date: n.date, game: title.get(m.titleId) ?? 'a game' }))),
    });
    return digestLines(digest);
  }, [checkins, clothes, outfits, workdays, workevents, takeout, rides, receipts, plays, music, nights, titles, end]);

  if (lines.length === 0) return null;
  return (
    <Section title="This week" note="The last 7 days across the app.">
      <ul className="digest-list">
        {lines.map((l): ReactNode => (
          <li key={l.key}>
            <strong>{l.title}</strong>
            <span className="small">{l.text}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
