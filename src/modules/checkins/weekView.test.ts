import { describe, expect, it } from 'vitest';
import { buildDigest } from './digest';
import { dayDots, deltaText, spentOf, weekHighlights, weekTiles } from './weekView';

const base = { checkins: [], worn: new Map(), days: new Map(), start: '2026-10-19', end: '2026-10-25' };
const prevBase = { ...base, start: '2026-10-12', end: '2026-10-18' };
const ci = (venue: string, date: string) => ({ id: `${venue}${date}`, venue, date, time: '10:00', source: 'swarm' as const });
const day = (d: string) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7];

describe('deltaText', () => {
  it('says how it differs from last week, and nothing when both are empty', () => {
    expect(deltaText(5, 2)).toBe('+3 vs last week');
    expect(deltaText(1, 4)).toBe('−3 vs last week');
    expect(deltaText(2, 2)).toBe('same as last week');
    expect(deltaText(0, 0)).toBeUndefined();
    expect(deltaText(10.5, 5, (n) => `€${n}`)).toBe('+€5.5 vs last week');
  });
});

describe('dayDots', () => {
  it('has a dot per kind of thing that happened, in a fixed order', () => {
    const d = buildDigest({ ...base, checkins: [ci('Cafe', '2026-10-20')], worn: new Map([['2026-10-20', { outfits: ['A'], items: [] }]]), days: new Map([['2026-10-20', { status: 'office' as const, manual: false }]]), rides: [{ date: '2026-10-20', fare: 5, currency: 'EUR' }] });
    expect(dayDots(d.daily[1]).map((x) => x.key)).toEqual(['work', 'places', 'outfit', 'rides']);
    expect(dayDots(d.daily[0])).toEqual([]);
  });
});

describe('weekTiles', () => {
  const cur = buildDigest({ ...base, checkins: [ci('A', '2026-10-20'), ci('B', '2026-10-21')], takeout: [{ date: '2026-10-20', place: 'X', total: 10, currency: 'EUR' }], rides: [{ date: '2026-10-21', fare: 5, currency: 'EUR' }] });
  const prev = buildDigest({ ...prevBase, checkins: [ci('A', '2026-10-13')] });
  it('sets each number against the week before and leaves out ones that are 0 both weeks', () => {
    const tiles = weekTiles(cur, prev, (n) => `€${n}`);
    expect(tiles.map((t) => t.key)).toEqual(['checkins', 'new', 'spent']);
    expect(tiles[0]).toMatchObject({ value: '2', delta: '+1 vs last week' });
    expect(tiles[2]).toMatchObject({ value: '€15', delta: '+€15 vs last week' });
    expect(spentOf(cur)).toBe(15);
  });
});

describe('weekHighlights', () => {
  it('names the busiest day, new places, days without an outfit and favourites', () => {
    const d = buildDigest({
      ...base,
      checkins: [ci('A', '2026-10-24'), ci('B', '2026-10-24'), ci('C', '2026-10-24'), ci('D', '2026-10-24'), ci('E', '2026-10-20')],
      worn: new Map([['2026-10-19', { outfits: ['x'], items: [] }]]),
      watched: [{ date: '2026-10-21', title: 'Pose', kind: 'episode' }, { date: '2026-10-22', title: 'Pose', kind: 'episode' }],
    });
    const h = weekHighlights(d, day);
    expect(h.find((x) => x.key === 'busiest')).toMatchObject({ text: 'Sat was the busiest day: 4 check-ins', date: '2026-10-24' });
    expect(h.find((x) => x.key === 'new')?.text).toBe('New places: E, A, B and 2 more');
    expect(h.find((x) => x.key === 'outfits')).toMatchObject({ text: 'No outfit logged on Tue, Wed, Thu, Fri, Sat, Sun', date: '2026-10-20' });
    expect(h.find((x) => x.key === 'watching')?.text).toBe('Watched most: Pose (2 plays)');
  });

  it('has nothing to say about a quiet week beyond what is missing', () => {
    const h = weekHighlights(buildDigest({ ...base, worn: new Map(Array.from({ length: 7 }, (_, i) => [`2026-10-${19 + i}`, { outfits: ['x'], items: [] }])) }), day);
    expect(h).toEqual([]);
  });
});
