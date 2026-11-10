import { describe, expect, it } from 'vitest';
import { callReadTool } from './readTools';
import type { ToolContext } from './mcpTools';
import type { ReadStore, RecordStore, Row } from './records';

function ctxWith(seed: Partial<Record<ReadStore, Row[]>>): ToolContext {
  const store: RecordStore = {
    list: async (s) => seed[s] ?? [],
    put: async () => {
      throw new Error('read tools must not write');
    },
    photos: async () => new Map(),
  };
  return { store, readOnly: true, now: new Date('2026-10-25T12:00:00Z'), newId: () => 'x', appUrl: 'https://life.test' };
}

const run = async (name: string, args: Record<string, unknown>, seed: Partial<Record<ReadStore, Row[]>>) => {
  const r = (await callReadTool(name, args, ctxWith(seed)))!;
  return { isError: !!r.isError, text: r.text, json: () => JSON.parse(r.text) };
};

const GAMES: Partial<Record<ReadStore, Row[]>> = {
  players: [
    { id: 'ana', name: 'Ana' },
    { id: 'ben', name: 'Ben' },
  ],
  gametitles: [{ id: 'catan', name: 'Catan', rule: 'high' }],
  gamenights: [
    {
      id: 'n1',
      date: '2026-10-10',
      location: 'Ana\'s place',
      playerIds: ['ana', 'ben'],
      createdAt: '2026-10-10T20:00:00Z',
      matches: [
        { id: 'm1', titleId: 'catan', playerIds: ['ana', 'ben'], scores: { ana: 10, ben: 7 }, winnerIds: ['ana'] },
        { id: 'm2', titleId: 'catan', playerIds: ['ana', 'ben'], scores: { ana: 5, ben: 9 }, winnerIds: ['ben'] },
        { id: 'm3', titleId: 'catan', playerIds: ['ana', 'ben'], scores: {}, winnerIds: [], live: true },
      ],
    },
  ],
};

describe('day_summary', () => {
  const seed: Partial<Record<ReadStore, Row[]>> = {
    ...GAMES,
    clothes: [{ id: 'tee', name: 'White tee', category: 'tops', status: 'active', wears: ['2026-10-10'] }],
    outfits: [],
    workevents: [],
    workdays: [{ id: '2026-10-10', status: 'office', arrive: '09:00', leave: '17:30' }],
    checkins: [{ id: 'c1', venue: 'Cafe Nero', category: 'Coffee Shop', city: 'Zagreb', date: '2026-10-10', time: '10:15', source: 'swarm' }],
    woltorders: [{ id: 'w1', restaurant: 'Sushi Bar', date: '2026-10-10', time: '20:00', total: 24.5, currency: 'EUR' }],
    watched: [{ id: 't1', kind: 'episode', title: 'Severance', at: '2026-10-10T21:30:00Z', season: 2, number: 3 }],
    musicdays: [{ id: 'm', date: '2026-10-10', plays: 40, ms: 7_200_000, topArtists: [{ name: 'Bonobo', plays: 9 }] }],
    trips: [{ id: 'trip-1', name: 'Lisbon', destination: 'Lisbon', startDate: '2026-10-09', endDate: '2026-10-12', tripitRef: 'tripit-a' }],
    tripitplans: [{ id: 'tripit-a', kind: 'flight', title: 'ZAG → LIS', start: '2026-10-09', end: '2026-10-09', startTime: '07:00' }],
    foodreceipts: [{ id: 'f1', store: 'Konzum', date: '2026-10-10', total: 12.3, lines: [] }],
  };

  it('gathers every module for the day and leaves other days out', async () => {
    const r = (await run('day_summary', { date: '2026-10-10' }, seed)).json();
    expect(r.worn.items).toEqual(['White tee']);
    expect(r.work).toEqual({ status: 'office', arrive: '09:00', leave: '17:30' });
    expect(r.places[0].venue).toBe('Cafe Nero');
    expect(r.takeout[0]).toMatchObject({ restaurant: 'Sushi Bar', total: 24.5 });
    expect(r.watched[0]).toMatchObject({ title: 'Severance', episode: 'S02E03' });
    expect(r.music).toMatchObject({ plays: 40, hours: 2, topArtists: ['Bonobo'] });
    expect(r.trip[0]).toMatchObject({ name: 'Lisbon', dayOfTrip: 2, of: 4 });
    expect(r.trip[0].plans).toEqual([]);
    expect(r.groceries[0]).toEqual({ store: 'Konzum', total: 12.3 });
    expect(r.games[0].games.map((g: { winners: string[] }) => g.winners)).toEqual([['Ana'], ['Ben'], []]);
  });

  it('lists the plans of the day the plan starts', async () => {
    const r = (await run('day_summary', { date: '2026-10-09' }, seed)).json();
    expect(r.trip[0].plans[0]).toMatchObject({ kind: 'flight', time: '07:00' });
  });

  it('says so when nothing is recorded, and rejects a bad date', async () => {
    expect((await run('day_summary', { date: '2026-01-01' }, seed)).json().note).toMatch(/Nothing/);
    expect((await run('day_summary', { date: '2026-13-01' }, seed)).isError).toBe(true);
  });
});

describe('games', () => {
  it('lists nights with names and leaves no ids', async () => {
    const r = (await run('list_game_nights', { query: 'ana catan' }, GAMES)).json();
    expect(r.nights[0].players).toEqual(['Ana', 'Ben']);
    expect(r.nights[0].games[0]).toMatchObject({ game: 'Catan', winners: ['Ana'], scores: { Ana: 10, Ben: 7 } });
    expect((await run('list_game_nights', { query: 'monopoly' }, GAMES)).text).toMatch(/No game nights/);
  });

  it('computes records, ignores live games and gives head to head', async () => {
    const r = (await run('game_stats', { player: 'ana', versus: 'ben' }, GAMES)).json();
    expect(r.players.find((p: { player: string }) => p.player === 'Ana')).toMatchObject({ played: 2, wins: 1 });
    expect(r.games[0]).toMatchObject({ game: 'Catan', plays: 2 });
    expect(r.headToHead).toEqual({ Ana: 1, Ben: 1, gamesTogether: 2 });
  });

  it('needs both players for a head-to-head and knows its games', async () => {
    expect((await run('game_stats', { player: 'ana' }, GAMES)).isError).toBe(true);
    expect((await run('game_stats', { game: 'chess' }, GAMES)).isError).toBe(true);
    expect((await run('game_stats', { player: 'zed', versus: 'ben' }, GAMES)).isError).toBe(true);
  });
});

describe('trips', () => {
  const seed: Partial<Record<ReadStore, Row[]>> = {
    trips: [
      { id: 'trip-1', name: 'Lisbon', destination: 'Lisbon, Portugal', country: 'PT', startDate: '2026-10-09', endDate: '2026-10-12', tripitRef: 'p' },
      { id: 'trip-2', name: 'Lisbon again', startDate: '2026-12-01', endDate: '2026-12-03' },
      { id: 'trip-3', name: 'Rome', startDate: '2026-03-01', endDate: '2026-03-05', swarmRef: 'c' },
    ],
    tripitplans: [
      { id: 'p1', kind: 'lodging', title: 'Hotel Alfama', start: '2026-10-09', end: '2026-10-12', location: 'Lisbon' },
      { id: 'p0', kind: 'flight', title: 'ZAG → LIS', start: '2026-10-09', end: '2026-10-09', startTime: '07:00' },
      { id: 'p2', kind: 'activity', title: 'Removed one', start: '2026-10-10', end: '2026-10-10', removed: 1 },
    ],
  };

  it('lists newest first with state and source', async () => {
    const r = (await run('list_trips', {}, seed)).json();
    expect(r.trips.map((t: { id: string }) => t.id)).toEqual(['trip-2', 'trip-1', 'trip-3']);
    expect(r.trips[0].state).toBe('upcoming');
    expect(r.trips[1]).toMatchObject({ state: 'past', source: 'tripit', days: 4, plans: 2 });
    expect(r.trips[2].source).toBe('swarm');
    expect((await run('list_trips', { when: 'upcoming' }, seed)).json().trips).toHaveLength(1);
  });

  it('gives the itinerary day by day without removed plans, and refuses an ambiguous trip', async () => {
    const r = (await run('trip_itinerary', { trip: 'trip-1' }, seed)).json();
    expect(r.itinerary).toHaveLength(1);
    expect(r.itinerary[0].items.map((i: { title: string }) => i.title)).toEqual(['Hotel Alfama', 'ZAG → LIS']);
    const ambiguous = await run('trip_itinerary', { trip: 'lisbon' }, seed);
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.text).toContain('trip-2');
    expect((await run('trip_itinerary', { trip: 'paris' }, seed)).isError).toBe(true);
  });
});

describe('watching and music', () => {
  const seed: Partial<Record<ReadStore, Row[]>> = {
    watched: [
      { id: 'a', kind: 'episode', title: 'Severance', at: '2026-10-10T21:30:00Z', season: 2, number: 3, episodeTitle: 'Who Is Alive?' },
      { id: 'b', kind: 'episode', title: 'Severance', at: '2026-10-11T21:30:00Z', season: 2, number: 4 },
      { id: 'c', kind: 'movie', title: 'Heat', at: '2026-09-01T18:00:00Z' },
    ],
    musicdays: [
      { id: 'm1', date: '2026-10-10', plays: 40, ms: 7_200_000, topArtists: [{ id: 1, name: 'Bonobo', plays: 9 }], topTracks: [{ id: 5, name: 'Kerala', artist: 'Bonobo', plays: 3 }] },
      { id: 'm2', date: '2026-10-20', plays: 10, ms: 1_800_000, topArtists: [{ id: 1, name: 'Bonobo', plays: 4 }], topTracks: [] },
      { id: 'm3', date: '2026-08-01', plays: 99, ms: 9_000_000, topArtists: [], topTracks: [] },
    ],
  };

  it('lists plays newest first with totals', async () => {
    const r = (await run('list_watched', { from: '2026-10-01' }, seed)).json();
    expect(r).toMatchObject({ total: 2, episodes: 2, movies: 0 });
    expect(r.mostWatched[0]).toEqual({ title: 'Severance', plays: 2 });
    expect(r.plays[0]).toMatchObject({ date: '2026-10-11', time: '21:30', episode: 'S02E04' });
    expect((await run('list_watched', { query: 'heat' }, seed)).json().plays[0].kind).toBe('movie');
    expect((await run('list_watched', { query: 'nothing' }, seed)).text).toMatch(/Nothing watched/);
  });

  it('sums listening over the last 30 days by default', async () => {
    const r = (await run('music_summary', {}, seed)).json();
    expect(r).toMatchObject({ from: '2026-09-26', to: '2026-10-25', plays: 50, hours: 2.5, daysWithMusic: 2 });
    expect(r.busiestDay.date).toBe('2026-10-10');
    expect(r.topArtists[0]).toEqual({ artist: 'Bonobo', plays: 13 });
    expect(r.topTracks[0]).toEqual({ track: 'Kerala', artist: 'Bonobo', plays: 3 });
    expect((await run('music_summary', { date: '2026-01-01' }, seed)).text).toMatch(/No listening/);
  });
});

describe('closet_stats', () => {
  const seed: Partial<Record<ReadStore, Row[]>> = {
    clothes: [
      { id: 'tee', name: 'White tee', category: 'tops', status: 'active', price: 20, wears: ['2026-10-20', '2026-10-21'], priorWears: 8, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'coat', name: 'Wool coat', category: 'outerwear', status: 'active', price: 200, wears: ['2026-01-05'], createdAt: '2025-11-01T00:00:00Z' },
      { id: 'hat', name: 'Hat', category: 'accessories', status: 'active', price: 30, wears: [], purchaseDate: '2025-05-01', createdAt: '2026-02-01T00:00:00Z' },
      { id: 'old', name: 'Old top', category: 'tops', status: 'sold', price: 10, wears: ['2025-01-01'] },
    ],
  };

  it('ranks active pieces and finds the unworn and idle ones', async () => {
    const r = (await run('closet_stats', {}, seed)).json();
    expect(r.pieces).toEqual({ active: 3, total: 4 });
    expect(r.spentOnAll).toBe(260);
    expect(r.valueOfActive).toBe(250);
    expect(r.totalWears).toBe(2 + 8 + 1 + 1);
    expect(r.wearsLast30Days).toBe(2);
    expect(r.mostWorn[0]).toMatchObject({ id: 'tee', timesWorn: 10, costPerWear: 2 });
    expect(r.bestCostPerWear[0].id).toBe('tee');
    expect(r.worstCostPerWear[0].id).toBe('coat');
    expect(r.neverWorn).toMatchObject({ count: 1 });
    expect(r.neverWorn.oldest[0]).toMatchObject({ id: 'hat', since: '2025-05-01' });
    expect(r.notWornIn90Days.longestIdle.map((p: { id: string }) => p.id)).toEqual(['coat']);
  });

  it('limits to a category', async () => {
    const r = (await run('closet_stats', { category: 'tops' }, seed)).json();
    expect(r.pieces).toEqual({ active: 1, total: 2 });
  });
});

describe('food_stats', () => {
  const line = (name: string, kind: string, paid: number, discount = 0) => ({ name, kind, quantity: 1, unit: 'pc', unitPrice: paid, discount, paid });
  const seed: Partial<Record<ReadStore, Row[]>> = {
    foodreceipts: [
      { id: 'r1', store: 'Konzum', date: '2026-10-05', total: 15, lines: [line('Milk', 'food', 1.5, 0.3), line('Cheese', 'food', 8), line('Shampoo', 'household', 5.5)] },
      { id: 'r2', store: 'Lidl', date: '2026-09-20', total: 9, lines: [line('Milk', 'food', 1.2), line('Bottle deposit', 'deposit', 0.5), line('Bread', 'food', 7.3)] },
      { id: 'r3', store: 'Lidl', date: '2024-01-01', total: 99, lines: [line('Old', 'food', 99)] },
    ],
    foodproducts: [],
    foodstock: [{ id: 'e1', productId: 'fp-cheese', type: 'toss', quantity: 1, date: '2026-10-08', createdAt: '2026-10-08T10:00:00Z', source: 'app' }],
  };

  it('adds up the period and leaves household, deposits and older receipts out', async () => {
    const r = (await run('food_stats', { months: 3 }, seed)).json();
    expect(r.period).toEqual({ from: '2026-08-01', to: '2026-10-25', months: 3 });
    expect(r.totalFoodSpend).toBe(18);
    expect(r.spendPerMonth.map((m: { month: string; spent: number }) => [m.month, m.spent])).toEqual([['2026-08', 0], ['2026-09', 8.5], ['2026-10', 9.5]]);
    expect(r.byStore[0]).toMatchObject({ store: 'Konzum', trips: 1 });
    expect(r.shopping.trips).toBe(2);
    expect(r.savedByOffers.saved).toBe(0.3);
    expect(r.depositsPaid).toEqual({ paid: 0.5, lines: 1 });
    expect(r.foodThrownAway.times).toBe(1);
    expect(r.boughtMostOften[0]).toMatchObject({ product: 'Milk', purchases: 2 });
  });

  it('says so with no receipts', async () => {
    expect((await run('food_stats', {}, {})).text).toMatch(/No grocery receipts/);
  });
});

describe('callReadTool', () => {
  it('ignores names it does not own', async () => {
    expect(await callReadTool('find_items', {}, ctxWith({}))).toBeUndefined();
  });
});
