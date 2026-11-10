// Read-only MCP tools that look across modules: a whole day, game nights, trips, what was
// watched and listened to, and summaries of the closet and of food. They change nothing, and
// reuse the app's pure helpers so the numbers match what the app shows. Dates in the watch
// history count on their UTC day, because the Worker has no time zone.

import { buildDays } from '../src/modules/work/work';
import type { WorkDay, WorkEvent } from '../src/modules/work/types';
import { filterCheckins, newestFirst } from '../src/modules/checkins/placesQuery';
import { headToHead, playerRecords, playsPerMonth, titleStats } from '../src/modules/games/games';
import type { GameNight, GameTitle, Match } from '../src/modules/games/types';
import { plansOfTrip } from '../src/modules/trips/tripit';
import type { Trip } from '../src/modules/trips/types';
import type { TripitPlan } from './tripitTypes';
import { topOf } from '../src/modules/music/music';
import type { MusicDay } from '../src/modules/music/types';
import { depositSummary, monthlyFoodSpend, rebuyStats, savedByOffers, shoppingHabits, spendByCategory, spendByStore, wasteSummary } from '../src/modules/food/foodStats';
import { productSummaries } from '../src/modules/food/products';
import type { FoodProduct, FoodReceipt, StockEvent } from '../src/modules/food/types';
import { CATEGORIES } from '../src/modules/clothes/types';
import type { ToolContext, ToolResult } from './mcpTools';
import type { Row } from './records';
import { addDays, dateRange, fail, isRealDate, num, ok, placeCheckins, text, timesWorn, lastWorn, utcToday, wornByDay, type Args } from './toolUtil';

const round2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
const hasWords = (fields: unknown[], query: string) => {
  const hay = fields.map((f) => String(f ?? '')).join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
};
const limitOf = (v: unknown, fallback: number, max: number) => Math.min(Math.max(Math.floor(Number(v)) || fallback, 1), max);
const when = (at: unknown) => ({ date: String(at).slice(0, 10), time: String(at).slice(11, 16) });
const episodeCode = (r: Row) => (r.kind === 'episode' && typeof r.season === 'number' && typeof r.number === 'number' ? `S${String(r.season).padStart(2, '0')}E${String(r.number).padStart(2, '0')}` : '');

export const READ_TOOLS = [
  {
    name: 'day_summary',
    description:
      'Everything that happened on one day, in one call: what was worn (outfits and loose pieces), the work status and times, the trip it falls in and the itinerary plans, places checked in to, takeout and rides (amounts in their currency), grocery receipts, what was watched, music listened to and game nights. Use it for "what did I do on …?", "how was Saturday?" or to write a journal entry for a day. Sections with nothing in them are left out. Watching counts on the UTC day. Read only.',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD. Default: today (UTC).' } },
    },
  },
  {
    name: 'list_game_nights',
    description:
      'Game nights (board and card games) the user logged, newest first: date, place, who played and each game with its players, scores and winners. Filter with `date` or `from` / `to`, and/or words (query) that must appear in a game name, player name, place or note. Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD, one night.' },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        query: { type: 'string', description: 'Words from a game, player, place or note, e.g. "catan ana".' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 10.' },
      },
    },
  },
  {
    name: 'game_stats',
    description:
      'Records from the game nights: wins, win rate and streaks per player, plays and best score per game, games per month, and with `player` and `versus` the head-to-head between two players. `game` limits the player records to one game. Games being played right now are left out. Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        game: { type: 'string', description: 'Words from a game name, e.g. "catan".' },
        player: { type: 'string', description: 'A player\'s name (with versus: head-to-head).' },
        versus: { type: 'string', description: 'The other player\'s name.' },
      },
    },
  },
  {
    name: 'list_trips',
    description:
      'The user\'s trips, newest first: name, destination, country, dates, length, whether it is upcoming, under way or past, where it came from (TripIt, Swarm check-ins or by hand) and how many itinerary plans it has. Filter with words (query), `when` (upcoming, current, past) or a `from` / `to` range that the trip overlaps. Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words from the trip name or destination.' },
        when: { type: 'string', enum: ['upcoming', 'current', 'past'] },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 20.' },
      },
    },
  },
  {
    name: 'trip_itinerary',
    description:
      'The itinerary of one trip day by day: flights, stays, activities and the like from TripIt, with times and places (plans the user removed are left out). Give the trip\'s id or words from its name or destination; if several trips match the call fails and lists them. Read only.',
    inputSchema: {
      type: 'object',
      properties: { trip: { type: 'string', description: 'Trip id, or words from its name or destination, e.g. "lisbon".' } },
      required: ['trip'],
    },
  },
  {
    name: 'list_watched',
    description:
      'What the user watched (Trakt history of movies and episodes), newest first, for a day or range and/or words from the title. Returns each play with its date, time (UTC), title and episode, plus totals and the most watched titles in that range. Use it for "what did I watch last weekend?" or "when did I last watch X?". Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD, one day.' },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        query: { type: 'string', description: 'Words from the title.' },
        kind: { type: 'string', enum: ['movie', 'episode'] },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Plays listed. Default 30.' },
      },
    },
  },
  {
    name: 'music_summary',
    description:
      'What the user listened to (stats.fm): plays, hours, days with music, the busiest day, and top artists and tracks, for a day or range (default: the 30 days up to today). Top lists add up each day\'s own top 5, so they approximate the real totals. Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD, one day.' },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        top: { type: 'integer', minimum: 1, maximum: 20, description: 'Length of the top lists. Default 5.' },
      },
    },
  },
  {
    name: 'closet_stats',
    description:
      'How the wardrobe is used: pieces and what they cost, wears in total and in the last 30 days, pieces per category, the most worn pieces, the best and worst cost per wear, pieces never worn (oldest first) and pieces not worn for 90 days. Only active pieces are ranked; wear counts include undated earlier wears. Use it for "what do I never wear?", "what is my best value piece?" or a closet clear-out. `category` limits it to one category. Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: [...CATEGORIES] },
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Length of each list. Default 5.' },
      },
    },
  },
  {
    name: 'food_stats',
    description:
      'Food spending and habits over the last N months (default 6): spend per month, per store and per category, how often and how much per shop, what offers saved, deposits paid, food thrown away (valued at what it cost) and the products bought most often. Household & care items and deposits are left out of food spend. Amounts are in the receipts\' currency. Use it for "how much did I spend on food this month?" or "what do I throw away?". Read only.',
    inputSchema: {
      type: 'object',
      properties: { months: { type: 'integer', minimum: 1, maximum: 24, description: 'Default 6.' } },
    },
  },
] as const;

export async function callReadTool(name: string, args: Args, ctx: ToolContext): Promise<ToolResult | undefined> {
  switch (name) {
    case 'day_summary':
      return daySummary(args, ctx);
    case 'list_game_nights':
      return listGameNights(args, ctx);
    case 'game_stats':
      return gameStats(args, ctx);
    case 'list_trips':
      return listTrips(args, ctx);
    case 'trip_itinerary':
      return tripItinerary(args, ctx);
    case 'list_watched':
      return listWatched(args, ctx);
    case 'music_summary':
      return musicSummary(args, ctx);
    case 'closet_stats':
      return closetStats(args, ctx);
    case 'food_stats':
      return foodStats(args, ctx);
    default:
      return undefined;
  }
}

// ---- games ----

async function gamesData({ store }: ToolContext) {
  const [nights, titles, players] = await Promise.all([store.list('gamenights'), store.list('gametitles'), store.list('players')]);
  const titleName = new Map(titles.map((t) => [t.id, String(t.name ?? 'a game')]));
  const playerName = new Map(players.map((p) => [p.id, String(p.name ?? 'someone')]));
  const nightList = nights
    .filter((n) => isRealDate(n.date))
    .map((n) => ({ ...n, playerIds: Array.isArray(n.playerIds) ? n.playerIds : [], matches: Array.isArray(n.matches) ? n.matches : [], createdAt: String(n.createdAt ?? '') }) as unknown as GameNight);
  const titleList = titles.map((t) => ({ id: t.id, name: String(t.name ?? ''), rule: t.rule === 'low' || t.rule === 'manual' ? t.rule : 'high' }) as unknown as GameTitle);
  const nameOf = (id: string) => playerName.get(id) ?? 'someone';
  return { nightList, titleList, titleName, nameOf, playerName };
}

const describeMatch = (m: Match, titleName: Map<string, string>, nameOf: (id: string) => string) => ({
  game: titleName.get(m.titleId) ?? 'a game',
  players: m.playerIds.map(nameOf),
  ...(Object.keys(m.scores ?? {}).length ? { scores: Object.fromEntries(Object.entries(m.scores).map(([id, v]) => [nameOf(id), v])) } : {}),
  winners: (m.winnerIds ?? []).map(nameOf),
  ...(m.live ? { inProgress: true } : {}),
  ...(m.note ? { note: m.note } : {}),
});

async function listGameNights(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const range = dateRange(args);
  if (typeof range === 'string') return fail(range);
  const { nightList, titleName, nameOf } = await gamesData(ctx);
  const query = text(args.query);
  const found = nightList
    .filter((n) => (!range.from || n.date >= range.from) && (!range.to || n.date <= range.to))
    .filter((n) => !query || hasWords([n.location, n.notes, ...n.playerIds.map(nameOf), ...n.matches.map((m) => titleName.get(m.titleId))], query))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  if (found.length === 0) return ok('No game nights match.');
  const shown = found.slice(0, limitOf(args.limit, 10, 50));
  return ok({
    total: found.length,
    showing: shown.length,
    nights: shown.map((n) => ({
      date: n.date,
      ...(n.location ? { place: n.location } : {}),
      players: n.playerIds.map(nameOf),
      ...(n.notes ? { notes: n.notes } : {}),
      games: n.matches.map((m) => describeMatch(m, titleName, nameOf)),
    })),
  });
}

async function gameStats(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { nightList, titleList, titleName, nameOf, playerName } = await gamesData(ctx);
  if (nightList.every((n) => n.matches.length === 0)) return ok('No games have been logged yet.');
  const idOfPlayer = (name: string): string | { error: ToolResult } => {
    const hits = [...playerName].filter(([, n]) => n.toLowerCase() === name.toLowerCase() || hasWords([n], name));
    const exact = hits.filter(([, n]) => n.toLowerCase() === name.toLowerCase());
    const pick = exact.length === 1 ? exact : hits;
    if (pick.length === 1) return pick[0][0];
    return { error: fail(pick.length === 0 ? `No player matches "${name}". Players: ${[...playerName.values()].join(', ')}.` : `"${name}" matches several players: ${pick.map(([, n]) => n).join(', ')}.`) };
  };
  const gameQuery = text(args.game);
  let titleId: string | undefined;
  if (gameQuery) {
    const hits = titleList.filter((t) => hasWords([t.name], gameQuery));
    if (hits.length !== 1) return fail(hits.length === 0 ? `No game matches "${gameQuery}". Games: ${titleList.map((t) => t.name).join(', ')}.` : `"${gameQuery}" matches several games: ${hits.map((t) => t.name).join(', ')}.`);
    titleId = hits[0].id;
  }
  const playerArg = text(args.player);
  const versusArg = text(args.versus);
  let versus: object | undefined;
  if (playerArg || versusArg) {
    if (!playerArg || !versusArg) return fail('Head-to-head needs both player and versus.');
    const a = idOfPlayer(playerArg);
    const b = idOfPlayer(versusArg);
    if (typeof a !== 'string') return a.error;
    if (typeof b !== 'string') return b.error;
    const h = headToHead(nightList, a, b);
    versus = { [nameOf(a)]: h.aWins, [nameOf(b)]: h.bWins, gamesTogether: h.games };
  }
  return ok({
    ...(gameQuery ? { game: titleName.get(titleId!) } : {}),
    players: playerRecords(nightList, titleId).map((r) => ({ player: nameOf(r.id), played: r.played, wins: r.wins, winRatePercent: Math.round(r.winRate * 100), currentWinStreak: r.streak, bestWinStreak: r.bestStreak })),
    games: titleStats(nightList, titleList).map((t) => ({
      game: titleName.get(t.id) ?? 'a game',
      plays: t.plays,
      lastPlayed: t.lastPlayed,
      ...(t.topWinner ? { mostWins: { player: nameOf(t.topWinner.playerId), wins: t.topWinner.wins } } : {}),
      ...(t.bestScore ? { bestScore: { value: t.bestScore.value, player: nameOf(t.bestScore.playerId), date: t.bestScore.date } } : {}),
    })),
    playsPerMonth: playsPerMonth(nightList, utcToday(ctx.now), 6),
    ...(versus ? { headToHead: versus } : {}),
  });
}

// ---- trips ----

const tripsOf = async ({ store }: ToolContext): Promise<Trip[]> =>
  (await store.list('trips')).filter((t) => isRealDate(t.startDate) && isRealDate(t.endDate)).map((t) => t as unknown as Trip);

const plansOf = async ({ store }: ToolContext): Promise<TripitPlan[]> =>
  (await store.list('tripitplans'))
    .filter((p) => isRealDate(p.start) && !p.removed)
    .map((p) => ({ ...p, end: isRealDate(p.end) ? p.end : p.start }) as unknown as TripitPlan);

const tripState = (t: Trip, today: string) => (t.startDate > today ? 'upcoming' : t.endDate < today ? 'past' : 'current');

async function listTrips(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const range = dateRange(args);
  if (typeof range === 'string') return fail(range);
  const today = utcToday(ctx.now);
  const query = text(args.query);
  const state = text(args.when);
  const [trips, plans] = await Promise.all([tripsOf(ctx), plansOf(ctx)]);
  const found = trips
    .filter((t) => !query || hasWords([t.name, t.destination], query))
    .filter((t) => !state || tripState(t, today) === state)
    .filter((t) => (!range.from || t.endDate >= range.from) && (!range.to || t.startDate <= range.to))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (found.length === 0) return ok('No trips match.');
  const shown = found.slice(0, limitOf(args.limit, 20, 50));
  return ok({
    today_utc: today,
    total: found.length,
    showing: shown.length,
    trips: shown.map((t) => ({
      id: t.id,
      name: t.name,
      ...(t.destination ? { destination: t.destination } : {}),
      ...(t.country ? { country: t.country } : {}),
      startDate: t.startDate,
      endDate: t.endDate,
      days: daysBetween(t.startDate, t.endDate) + 1,
      state: tripState(t, today),
      source: t.tripitRef || t.id.startsWith('trip-tripit-') ? 'tripit' : t.swarmRef ? 'swarm' : 'manual',
      plans: plansOfTrip(plans, t).length,
    })),
  });
}

async function tripItinerary(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const query = text(args.trip);
  if (!query) return fail('trip is required: the trip id or words from its name, e.g. "lisbon".');
  const trips = await tripsOf(ctx);
  const exact = trips.filter((t) => t.id === query);
  const hits = exact.length ? exact : trips.filter((t) => hasWords([t.name, t.destination], query));
  if (hits.length === 0) return fail(`No trip matches "${query}". Use list_trips to see them.`);
  if (hits.length > 1) return fail(`"${query}" matches several trips: ${hits.map((t) => `${t.name} (${t.startDate}, id ${t.id})`).join('; ')}. Ask which one, or pass its id.`);
  const trip = hits[0];
  const plans = plansOfTrip(await plansOf(ctx), trip);
  const days = new Map<string, object[]>();
  for (const p of plans) {
    const list = days.get(p.start) ?? [];
    list.push({
      kind: p.kind,
      title: p.title,
      ...(p.startTime ? { time: p.startTime } : {}),
      ...(p.end !== p.start || p.endTime ? { until: p.endTime ? `${p.end} ${p.endTime}` : p.end } : {}),
      ...(p.location ? { place: p.location } : {}),
    });
    days.set(p.start, list);
  }
  return ok({
    trip: { id: trip.id, name: trip.name, ...(trip.destination ? { destination: trip.destination } : {}), startDate: trip.startDate, endDate: trip.endDate },
    ...(plans.length === 0 ? { note: 'No itinerary plans. They come from TripIt; trips made by hand or from check-ins have none.' } : {}),
    itinerary: [...days].map(([date, items]) => ({ date, items })),
  });
}

// ---- watching and music ----

async function listWatched(args: Args, { store, now }: ToolContext): Promise<ToolResult> {
  const range = dateRange(args);
  if (typeof range === 'string') return fail(range);
  const query = text(args.query);
  const kind = text(args.kind);
  const plays = (await store.list('watched')).filter((r) => typeof r.at === 'string');
  const found = plays
    .filter((r) => !kind || r.kind === kind)
    .filter((r) => !query || hasWords([r.title, r.episodeTitle], query))
    .filter((r) => {
      const d = when(r.at).date;
      return (!range.from || d >= range.from) && (!range.to || d <= range.to);
    })
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (found.length === 0) return ok('Nothing watched matches. The history comes from Trakt.');
  const counts = new Map<string, number>();
  for (const r of found) counts.set(String(r.title), (counts.get(String(r.title)) ?? 0) + 1);
  const episodes = found.filter((r) => r.kind === 'episode');
  return ok({
    today_utc: utcToday(now),
    total: found.length,
    movies: found.length - episodes.length,
    episodes: episodes.length,
    mostWatched: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([title, plays]) => ({ title, plays })),
    showing: Math.min(found.length, limitOf(args.limit, 30, 100)),
    plays: found.slice(0, limitOf(args.limit, 30, 100)).map((r) => ({
      ...when(r.at),
      title: r.title,
      kind: r.kind,
      ...(episodeCode(r) ? { episode: episodeCode(r) } : {}),
      ...(r.episodeTitle ? { episodeTitle: r.episodeTitle } : {}),
    })),
  });
}

async function musicSummary(args: Args, { store, now }: ToolContext): Promise<ToolResult> {
  const range = dateRange(args);
  if (typeof range === 'string') return fail(range);
  const today = utcToday(now);
  const to = range.to ?? today;
  const from = range.from ?? addDays(to, -29);
  const days = (await store.list('musicdays'))
    .filter((r) => isRealDate(r.date) && r.date >= from && r.date <= to)
    .map((r) => ({ ...r, plays: num(r.plays), ms: num(r.ms), topArtists: Array.isArray(r.topArtists) ? r.topArtists : [], topTracks: Array.isArray(r.topTracks) ? r.topTracks : [] }) as unknown as MusicDay);
  const active = days.filter((d) => d.plays > 0);
  if (active.length === 0) return ok(`No listening between ${from} and ${to}. It comes from stats.fm, which has to be set up in Settings.`);
  const top = limitOf(args.top, 5, 20);
  const busiest = active.reduce((a, b) => (b.ms > a.ms ? b : a));
  const plays = active.reduce((n, d) => n + d.plays, 0);
  const ms = active.reduce((n, d) => n + d.ms, 0);
  return ok({
    from,
    to,
    plays,
    hours: round2(ms / 3_600_000),
    daysWithMusic: active.length,
    busiestDay: { date: busiest.date, plays: busiest.plays, hours: round2(busiest.ms / 3_600_000) },
    topArtists: topOf(active, 'topArtists', '', top).map((a) => ({ artist: a.name, plays: a.plays })),
    topTracks: topOf(active, 'topTracks', '', top).map((t) => ({ track: t.name, ...(t.artist ? { artist: t.artist } : {}), plays: t.plays })),
    note: 'Top lists add up each day\'s own top 5, so they approximate the real totals.',
  });
}

// ---- day summary ----

async function daySummary(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { store, now } = ctx;
  if (args.date !== undefined && !isRealDate(args.date)) return fail('date must be a real calendar date in YYYY-MM-DD form.');
  const date = (args.date as string | undefined) ?? utcToday(now);
  const [checkins, items, outfits, workdays, workevents, takeout, rides, receipts, watched, music, trips, plans, games] = await Promise.all([
    placeCheckins(store),
    store.list('clothes'),
    store.list('outfits'),
    store.list('workdays'),
    store.list('workevents'),
    store.list('woltorders'),
    store.list('rides'),
    store.list('foodreceipts'),
    store.list('watched'),
    store.list('musicdays'),
    tripsOf(ctx),
    plansOf(ctx),
    gamesData(ctx),
  ]);
  const out: Record<string, unknown> = { date };
  const worn = wornByDay(items, outfits, date).get(date);
  if (worn && (worn.outfits.length || worn.items.length)) out.worn = worn;
  const day = buildDays(
    workdays.map((r) => ({ id: r.id, status: r.status, arrive: r.arrive, leave: r.leave, reason: r.reason }) as unknown as WorkDay),
    workevents.map((r) => ({ id: r.id, type: r.type, place: r.place, date: r.date, time: r.time }) as unknown as WorkEvent),
  ).get(date);
  if (day?.status) out.work = { status: day.status, ...(day.arrive ? { arrive: day.arrive } : {}), ...(day.leave ? { leave: day.leave } : {}), ...(day.reason ? { reason: day.reason } : {}) };
  const trip = trips.filter((t) => t.startDate <= date && t.endDate >= date);
  if (trip.length) {
    out.trip = trip.map((t) => ({
      name: t.name,
      ...(t.destination ? { destination: t.destination } : {}),
      dayOfTrip: daysBetween(t.startDate, date) + 1,
      of: daysBetween(t.startDate, t.endDate) + 1,
      plans: plansOfTrip(plans, t)
        .filter((p) => p.start <= date && p.end >= date)
        .slice(0, 15)
        .map((p) => ({ kind: p.kind, title: p.title, ...(p.start === date && p.startTime ? { time: p.startTime } : {}), ...(p.location ? { place: p.location } : {}) })),
    }));
  }
  const places = newestFirst(filterCheckins(checkins, { from: date, to: date })).reverse();
  if (places.length) out.places = places.map((c) => ({ ...(c.time ? { time: c.time } : {}), venue: c.venue, ...(c.category ? { category: c.category } : {}), ...(c.city ? { city: c.city } : {}) }));
  const orders = takeout.filter((r) => r.date === date);
  if (orders.length) out.takeout = orders.map((r) => ({ ...(r.time ? { time: r.time } : {}), restaurant: r.restaurant, total: num(r.total), currency: r.currency ?? 'EUR' }));
  const rideList = rides.filter((r) => r.date === date);
  if (rideList.length) out.rides = rideList.map((r) => ({ ...(r.time ? { time: r.time } : {}), provider: r.provider, ...(r.from ? { from: r.from } : {}), ...(r.to ? { to: r.to } : {}), fare: num(r.fare), currency: r.currency ?? 'EUR' }));
  const shops = receipts.filter((r) => r.date === date);
  if (shops.length) {
    out.groceries = shops.map((r) => ({
      store: r.store,
      total: typeof r.total === 'number' ? r.total : round2((Array.isArray(r.lines) ? r.lines : []).reduce((a: number, l: { paid?: unknown }) => a + num(l?.paid), 0)),
    }));
  }
  const seen = watched.filter((r) => typeof r.at === 'string' && when(r.at).date === date).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (seen.length) out.watched = seen.map((r) => ({ time: when(r.at).time, title: r.title, ...(episodeCode(r) ? { episode: episodeCode(r) } : {}) }));
  const listened = music.find((r) => r.date === date);
  if (listened && num(listened.plays) > 0) {
    out.music = {
      plays: num(listened.plays),
      hours: round2(num(listened.ms) / 3_600_000),
      topArtists: (Array.isArray(listened.topArtists) ? listened.topArtists : []).slice(0, 3).map((a: { name?: unknown }) => String(a?.name ?? '')),
    };
  }
  const night = games.nightList.filter((n) => n.date === date);
  if (night.length) {
    out.games = night.map((n) => ({
      ...(n.location ? { place: n.location } : {}),
      players: n.playerIds.map(games.nameOf),
      games: n.matches.map((m) => describeMatch(m, games.titleName, games.nameOf)),
    }));
  }
  if (Object.keys(out).length === 1) out.note = 'Nothing is recorded for this day.';
  if (date > utcToday(now)) out.note = 'This day is in the future, so only plans can be here.';
  return ok(out);
}

// ---- closet ----

async function closetStats(args: Args, { store, now }: ToolContext): Promise<ToolResult> {
  const today = utcToday(now);
  const category = text(args.category);
  const limit = limitOf(args.limit, 5, 30);
  const all = (await store.list('clothes')).filter((r) => !category || r.category === category);
  if (all.length === 0) return ok('No pieces match.');
  const active = all.filter((r) => r.status === 'active');
  const price = (r: Row) => (typeof r.price === 'number' ? r.price : undefined);
  const cpw = (r: Row) => (price(r) !== undefined && timesWorn(r) > 0 ? round2(price(r)! / timesWorn(r)) : undefined);
  const cutoff30 = addDays(today, -30);
  const cutoff90 = addDays(today, -90);
  const brief = (r: Row) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    timesWorn: timesWorn(r),
    lastWorn: lastWorn(r),
    ...(price(r) !== undefined ? { price: price(r) } : {}),
    ...(cpw(r) !== undefined ? { costPerWear: cpw(r) } : {}),
  });
  const ageOf = (r: Row) => String(r.purchaseDate ?? '') || String(r.createdAt ?? '').slice(0, 10) || today;
  const byCategory = new Map<string, number>();
  for (const r of active) byCategory.set(String(r.category), (byCategory.get(String(r.category)) ?? 0) + 1);
  const worn = active.filter((r) => timesWorn(r) > 0);
  const priced = worn.filter((r) => cpw(r) !== undefined);
  const never = active.filter((r) => timesWorn(r) === 0).sort((a, b) => ageOf(a).localeCompare(ageOf(b)));
  const idle = active.filter((r) => timesWorn(r) > 0 && lastWorn(r) !== null && lastWorn(r)! < cutoff90).sort((a, b) => lastWorn(a)!.localeCompare(lastWorn(b)!));
  return ok({
    ...(category ? { category } : {}),
    pieces: { active: active.length, total: all.length },
    spentOnAll: round2(all.reduce((s, r) => s + (price(r) ?? 0), 0)),
    valueOfActive: round2(active.reduce((s, r) => s + (price(r) ?? 0), 0)),
    totalWears: all.reduce((s, r) => s + timesWorn(r), 0),
    wearsLast30Days: all.reduce((s, r) => s + (Array.isArray(r.wears) ? (r.wears as string[]).filter((d) => d > cutoff30 && d <= today).length : 0), 0),
    activeByCategory: [...byCategory].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ category: name, count })),
    mostWorn: [...worn].sort((a, b) => timesWorn(b) - timesWorn(a)).slice(0, limit).map(brief),
    bestCostPerWear: [...priced].sort((a, b) => cpw(a)! - cpw(b)!).slice(0, limit).map(brief),
    worstCostPerWear: [...priced].sort((a, b) => cpw(b)! - cpw(a)!).slice(0, limit).map(brief),
    neverWorn: { count: never.length, oldest: never.slice(0, limit).map((r) => ({ ...brief(r), since: ageOf(r) })) },
    notWornIn90Days: { count: idle.length, longestIdle: idle.slice(0, limit).map(brief) },
    note: 'Pieces never worn may simply not have been logged yet; undated earlier wears count as wears.',
  });
}

// ---- food ----

async function foodStats(args: Args, { store, now }: ToolContext): Promise<ToolResult> {
  const months = limitOf(args.months, 6, 24);
  const today = utcToday(now);
  const nowMonth = today.slice(0, 7);
  const [receiptRows, productRows, eventRows] = await Promise.all([store.list('foodreceipts'), store.list('foodproducts'), store.list('foodstock')]);
  const receipts = receiptRows
    .filter((r) => isRealDate(r.date) && Array.isArray(r.lines))
    .map((r) => ({ ...r, store: String(r.store ?? ''), lines: (r.lines as object[]).map((l) => ({ discount: 0, ...l })) }) as unknown as FoodReceipt);
  if (receipts.length === 0) return ok('No grocery receipts yet.');
  const spend = monthlyFoodSpend(receipts, nowMonth, months);
  const since = `${spend[0].key}-01`;
  const period = receipts.filter((r) => r.date >= since);
  const records = productRows as unknown as FoodProduct[];
  const waste = wasteSummary(productSummaries(receipts, records), eventRows as unknown as StockEvent[], period, nowMonth, months);
  const total = round2(spend.reduce((s, p) => s + p.spent, 0));
  const habits = shoppingHabits(period);
  return ok({
    period: { from: since, to: today, months },
    totalFoodSpend: total,
    averagePerMonth: round2(total / months),
    spendPerMonth: spend.map((p) => ({ month: p.key, spent: p.spent, shops: p.trips })),
    shopping: { trips: habits.trips, averageBasket: habits.basket, tripsPerWeek: habits.perWeek },
    byStore: spendByStore(period).slice(0, 8),
    byCategory: spendByCategory(period, records).map((c) => ({ category: c.label, spent: c.spent })),
    savedByOffers: savedByOffers(period),
    depositsPaid: depositSummary(period),
    foodThrownAway: { value: waste.value, times: waste.times, ...(waste.share !== undefined ? { shareOfSpendPercent: round2(waste.share * 100) } : {}), mostWasted: waste.top.slice(0, 5).map((w) => ({ product: w.name, times: w.times, value: w.value })) },
    boughtMostOften: rebuyStats(productSummaries(period, records), 5).map((r) => ({ product: r.name, purchases: r.purchases, ...(r.everyDays ? { everyDays: r.everyDays } : {}), spent: r.spent })),
    note: 'Household & care, deposits and bags are not food spend. Amounts are as printed on the receipts.',
  });
}
