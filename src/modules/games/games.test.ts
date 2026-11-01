import { describe, expect, it } from 'vitest';
import { allMatches, headToHead, nightChampion, playerRecords, playsPerMonth, roundTotals, roundWinners, standings, titleStats, winnersFromScores } from './games';
import type { GameNight, GameTitle, Match } from './types';

const stamp = '2026-10-01T00:00:00Z';
const match = (titleId: string, playerIds: string[], winnerIds: string[], scores: Record<string, number> = {}): Match => ({
  id: `${titleId}-${winnerIds.join('')}-${Math.random()}`,
  titleId,
  playerIds,
  scores,
  winnerIds,
});
const night = (id: string, date: string, matches: Match[]): GameNight => ({
  id,
  date,
  playerIds: [],
  matches,
  createdAt: `${date}T20:00:00Z`,
  updatedAt: stamp,
});
const titles: GameTitle[] = [
  { id: 'catan', name: 'Catan', rule: 'high', createdAt: stamp, updatedAt: stamp },
  { id: 'golf', name: 'Golf', rule: 'low', createdAt: stamp, updatedAt: stamp },
];

describe('winnersFromScores', () => {
  it('picks the highest, the lowest, and every tied player', () => {
    expect(winnersFromScores('high', { a: 10, b: 7 }, ['a', 'b'])).toEqual(['a']);
    expect(winnersFromScores('low', { a: 10, b: 7 }, ['a', 'b'])).toEqual(['b']);
    expect(winnersFromScores('high', { a: 5, b: 5, c: 1 }, ['a', 'b', 'c'])).toEqual(['a', 'b']);
  });
  it('picks nobody without scores or for manual games, and ignores scores of players not in the game', () => {
    expect(winnersFromScores('high', {}, ['a'])).toEqual([]);
    expect(winnersFromScores('manual', { a: 3 }, ['a'])).toEqual([]);
    expect(winnersFromScores('high', { a: 3, z: 99 }, ['a'])).toEqual(['a']);
  });
});

const nights = [
  night('n2', '2026-10-10', [match('catan', ['a', 'b'], ['b'], { a: 6, b: 10 })]),
  night('n1', '2026-10-03', [match('catan', ['a', 'b', 'c'], ['a'], { a: 10, b: 8, c: 4 }), match('golf', ['a', 'b'], ['a', 'b'], { a: 40, b: 40 })]),
];

describe('playerRecords', () => {
  it('counts wins over the games each played, in date order, with streaks', () => {
    const r = Object.fromEntries(playerRecords(nights).map((x) => [x.id, x]));
    expect(r.a).toMatchObject({ played: 3, wins: 2, streak: 0, bestStreak: 2 });
    expect(r.b).toMatchObject({ played: 3, wins: 2, streak: 2, bestStreak: 2 });
    expect(r.c).toMatchObject({ played: 1, wins: 0, winRate: 0 });
    expect(r.a.winRate).toBeCloseTo(2 / 3);
  });
  it('can be limited to one game', () => {
    expect(playerRecords(nights, 'golf').map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
});

describe('headToHead', () => {
  it('only counts games both played', () => {
    expect(headToHead(nights, 'a', 'c')).toEqual({ games: 1, aWins: 1, bWins: 0 });
    expect(headToHead(nights, 'a', 'b')).toEqual({ games: 3, aWins: 2, bWins: 2 });
  });
});

describe('titleStats', () => {
  it('finds plays, last played, top winner and the best score by the rule', () => {
    const s = Object.fromEntries(titleStats(nights, titles).map((x) => [x.id, x]));
    expect(s.catan).toMatchObject({ plays: 2, lastPlayed: '2026-10-10', bestScore: { value: 10, playerId: 'a', date: '2026-10-03' } });
    expect(s.golf.bestScore!.value).toBe(40);
  });
  it('treats lower as better for low games', () => {
    const n = [night('x', '2026-10-01', [match('golf', ['a', 'b'], ['b'], { a: 50, b: 38 })])];
    expect(titleStats(n, titles)[0].bestScore).toMatchObject({ value: 38, playerId: 'b' });
  });
});

describe('misc', () => {
  it('orders matches by night date then play order', () => {
    expect(allMatches(nights).map((m) => m.date)).toEqual(['2026-10-03', '2026-10-03', '2026-10-10']);
  });
  it('counts plays per month, filling empty months', () => {
    const r = playsPerMonth(nights, '2026-11-15', 3);
    expect(r).toEqual([
      { month: '2026-09', plays: 0 },
      { month: '2026-10', plays: 3 },
      { month: '2026-11', plays: 0 },
    ]);
  });
  it('names a night champion only when one player has the most wins', () => {
    expect(nightChampion(nights[1])).toEqual({ playerId: 'a', wins: 2 });
    expect(nightChampion(night('t', '2026-10-01', [match('catan', ['a', 'b'], ['a']), match('catan', ['a', 'b'], ['b'])]))).toBeUndefined();
  });
});

describe('live games and rounds', () => {
  it('adds up rounds per player, treating blanks as 0', () => {
    expect(roundTotals([{ a: 5, b: 3 }, { a: -2 }, { b: 4 }], ['a', 'b', 'c'])).toEqual({ a: 3, b: 7, c: 0 });
  });
  it('leaves games still being played out of the stats', () => {
    const live = { ...match('catan', ['a', 'b'], ['a']), live: true };
    const n = [night('x', '2026-10-01', [live])];
    expect(allMatches(n)).toEqual([]);
    expect(playsPerMonth(n, '2026-10-05', 1)).toEqual([{ month: '2026-10', plays: 0 }]);
  });
});

describe('standings', () => {
  const rounds = [{ a: 10, b: 20, c: 20 }, { a: 5, b: 0, c: 1 }];
  it('ranks by total, sharing positions on ties, and shows the gap to the leader', () => {
    const s = standings([{ a: 10, b: 20, c: 20 }], ['a', 'b', 'c'], 'high');
    expect(s.map((x) => [x.id, x.position, x.behind])).toEqual([['b', 1, 0], ['c', 1, 0], ['a', 3, 10]]);
  });
  it('ranks the lowest total first for low games and reports the last round and trail', () => {
    const s = standings(rounds, ['a', 'b', 'c'], 'low');
    expect(s.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(s[0]).toMatchObject({ total: 15, last: 5, trail: [10, 5], behind: 0 });
    expect(s[1].behind).toBe(5);
    expect(s[2].behind).toBe(6);
  });
  it('gives the gap to the player directly above, not to the leader', () => {
    const s = standings([{ a: 30, b: 20, c: 5 }], ['a', 'b', 'c'], 'high');
    expect(s.map((x) => x.above)).toEqual([undefined, { id: 'a', gap: 10 }, { id: 'b', gap: 15 }]);
    expect(standings([{ a: 3, b: 1 }], ['a', 'b'], 'low')[1].above).toEqual({ id: 'b', gap: 2 });
  });
  it('handles a game with no rounds yet', () => {
    expect(standings([], ['a', 'b'], 'high').map((x) => [x.position, x.total])).toEqual([[1, 0], [1, 0]]);
  });
});

describe('domino calculator', () => {
  it('has a key for 1 to 12, each drawn with that many pips', async () => {
    const { DOMINO_KEYS, PIPS } = await import('./domino');
    expect([...DOMINO_KEYS]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const k of DOMINO_KEYS) expect(PIPS[k]).toHaveLength(k);
  });
  it('is switched on by the game name', async () => {
    const { isDomino } = await import('./domino');
    expect(isDomino({ name: 'Domino cubano' })).toBe(true);
    expect(isDomino({ name: 'Dominoes' })).toBe(true);
    expect(isDomino({ name: 'Catan' })).toBe(false);
    expect(isDomino(undefined)).toBe(false);
  });
});

describe('roundWinners', () => {
  it('picks the best points of the round by the rule', () => {
    expect(roundWinners('high', { a: 30, b: 12, c: 0 }, ['a', 'b', 'c'])).toEqual({ winners: ['a'], tied: [] });
    expect(roundWinners('low', { a: 30, b: 12, c: 0 }, ['a', 'b', 'c'])).toEqual({ winners: ['c'], tied: [] });
  });
  it('leaves a tie for the user to decide, then uses their pick', () => {
    expect(roundWinners('high', { a: 20, b: 20, c: 0 }, ['a', 'b', 'c'])).toEqual({ winners: [], tied: ['a', 'b'] });
    expect(roundWinners('high', { a: 20, b: 20, c: 0 }, ['a', 'b', 'c'], 'b')).toEqual({ winners: ['b'], tied: ['a', 'b'] });
    expect(roundWinners('high', { a: 5, b: 5 }, ['a', 'b'])).toEqual({ winners: [], tied: ['a', 'b'] });
  });
  it('ignores a pick that is not among the tied players', () => {
    expect(roundWinners('high', { a: 20, b: 20, c: 0 }, ['a', 'b', 'c'], 'c').winners).toEqual([]);
  });
  it('has no winner when nobody scored or the winner is picked by hand', () => {
    expect(roundWinners('high', {}, ['a', 'b'])).toEqual({ winners: [], tied: [] });
    expect(roundWinners('high', { a: 0, b: 0 }, ['a', 'b'])).toEqual({ winners: [], tied: [] });
    expect(roundWinners('manual', { a: 9, b: 1 }, ['a', 'b'])).toEqual({ winners: [], tied: [] });
  });
});

describe('catan details', () => {
  it('cleans empty entries and counts wins by seat', async () => {
    const { cleanCatan, seatStats, isCatan } = await import('./catan');
    expect(isCatan({ name: 'Catan' })).toBe(true);
    expect(cleanCatan({ seats: { a: 1 }, colors: { a: '' } }, ['a', 'b'])).toEqual({ seats: { a: 1 } });
    expect(cleanCatan({}, ['a'])).toBeUndefined();
    const m = (seats: Record<string, number>, winnerIds: string[], live = false) => ({ catan: { seats }, winnerIds, live });
    expect(seatStats([m({ a: 1, b: 2 }, ['a']), m({ a: 2, b: 1 }, ['a']), m({ a: 1, b: 2 }, [], true)])).toEqual({
      1: { games: 2, wins: 1 },
      2: { games: 2, wins: 1 },
    });
  });
});

describe('catan seat order', () => {
  it('orders by seat and moves a player', async () => {
    const { seatOrder, moveSeat } = await import('./catan');
    expect(seatOrder(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(seatOrder(['a', 'b', 'c'], { c: 1, a: 2 })).toEqual(['c', 'a', 'b']);
    expect(moveSeat(['a', 'b', 'c'], 'c', 0)).toEqual({ c: 1, a: 2, b: 3 });
    expect(moveSeat(['a', 'b', 'c'], 'a', 2)).toEqual({ b: 1, c: 2, a: 3 });
  });
});

describe('catan road and army', () => {
  it('keeps them only for players in the game', async () => {
    const { cleanCatan } = await import('./catan');
    expect(cleanCatan({ longestRoad: 'a', largestArmy: 'z' }, ['a', 'b'])).toEqual({ longestRoad: 'a' });
    expect(cleanCatan({ largestArmy: 'z' }, ['a'])).toBeUndefined();
  });
});

describe('catan bonus stats', () => {
  it('counts road and army and wins while holding them', async () => {
    const { bonusStats } = await import('./catan');
    const m = (catan: object | undefined, winnerIds: string[], live = false) => ({ catan, winnerIds, live, playerIds: ['a', 'b'] });
    const out = bonusStats([
      m({ longestRoad: 'a', largestArmy: 'b' }, ['a']),
      m({ longestRoad: 'a' }, ['b']),
      m(undefined, ['a']),
      m({ longestRoad: 'b' }, [], true),
    ]);
    expect(out).toEqual([
      { id: 'a', games: 2, road: 2, army: 0, roadWins: 1, armyWins: 0 },
      { id: 'b', games: 2, road: 0, army: 1, roadWins: 0, armyWins: 0 },
    ]);
  });
});

describe('Lords of Waterdeep', () => {
  it('cleans the info and works out the bonus', async () => {
    const { cleanWaterdeep, lordBonus, isWaterdeep } = await import('./waterdeep');
    expect(isWaterdeep({ name: 'Lords of Waterdeep' })).toBe(true);
    expect(cleanWaterdeep({ lords: { a: ' Mirt ', b: '', z: 'Gone' }, before: { a: 120, z: 5 } }, ['a', 'b'])).toEqual({ lords: { a: 'Mirt' }, before: { a: 120 } });
    expect(cleanWaterdeep({ lords: { a: '' } }, ['a'])).toBeUndefined();
    expect(lordBonus(120, 160)).toBe(40);
    expect(lordBonus(undefined, 160)).toBeUndefined();
  });

  it('counts games, wins, average bonus and comebacks per Lord', async () => {
    const { lordStats } = await import('./waterdeep');
    const m = (over: object) => ({ playerIds: ['a', 'b'], live: false, ...over }) as Parameters<typeof lordStats>[0][number];
    const out = lordStats([
      m({ waterdeep: { lords: { a: 'Mirt', b: 'Durnan' }, before: { a: 100, b: 110 } }, scores: { a: 150, b: 130 }, winnerIds: ['a'] }),
      m({ waterdeep: { lords: { a: 'Mirt', b: 'Durnan' } }, scores: { a: 90, b: 95 }, winnerIds: ['b'] }),
      m({ waterdeep: { lords: { a: 'Mirt' } }, scores: {}, winnerIds: [], live: true }),
    ]);
    const mirt = out.find((s) => s.lord === 'Mirt')!;
    expect(mirt).toMatchObject({ games: 2, wins: 1, bonusGames: 1, avgBonus: 50, turnarounds: 1 });
    expect(out.find((s) => s.lord === 'Durnan')).toMatchObject({ games: 2, wins: 1, avgBonus: 20, turnarounds: 0 });
  });
});

describe('Skullport corruption', () => {
  it('cleans corruption and counts it only for expansion games', async () => {
    const { cleanWaterdeep, corruptionStats } = await import('./waterdeep');
    expect(cleanWaterdeep({ skullport: true, corruption: { a: [-5, -10], b: [], z: [-1] } }, ['a', 'b'])).toEqual({ skullport: true, corruption: { a: [-5, -10] } });
    expect(cleanWaterdeep({ skullport: false }, ['a'])).toBeUndefined();
    const m = (over: object) => ({ playerIds: ['a', 'b'], live: false, ...over }) as Parameters<typeof corruptionStats>[0][number];
    // Counts times a shared value, and the older per-corruption lists still count.
    const fresh = corruptionStats([m({ waterdeep: { skullport: true, corruptionValue: -5, corruptions: { a: 3, b: 1 } }, winnerIds: ['a'] })]);
    expect(fresh.find((x) => x.id === 'a')).toMatchObject({ count: 3, points: -15 });
    expect(fresh.find((x) => x.id === 'b')).toMatchObject({ count: 1, points: -5 });
    expect(cleanWaterdeep({ skullport: true, corruptionValue: -5, corruptions: { a: 2, b: 0, z: 4 } }, ['a', 'b'])).toEqual({ skullport: true, corruptionValue: -5, corruptions: { a: 2 } });
    const out = corruptionStats([
      m({ waterdeep: { skullport: true, corruption: { a: [-5, -10] } }, winnerIds: ['b'] }),
      m({ waterdeep: { skullport: true, corruption: { a: [-5], b: [-2] } }, winnerIds: ['a'] }),
      m({ waterdeep: { corruption: { a: [-99] } }, winnerIds: ['a'] }),
    ]);
    expect(out.find((s) => s.id === 'a')).toEqual({ id: 'a', games: 2, wins: 1, count: 3, points: -20 });
    expect(out.find((s) => s.id === 'b')).toEqual({ id: 'b', games: 2, wins: 1, count: 1, points: -2 });
  });
});

describe('Waterdeep Lord list', () => {
  it('has all 17 distinct Lords', async () => {
    const { WATERDEEP_LORDS } = await import('./waterdeep');
    expect(WATERDEEP_LORDS).toHaveLength(17);
    expect(new Set(WATERDEEP_LORDS).size).toBe(17);
  });
});
