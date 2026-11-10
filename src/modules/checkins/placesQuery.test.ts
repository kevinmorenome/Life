import { describe, expect, it } from 'vitest';
import { filterCheckins, newestFirst, venueHistory, type PlaceCheckin } from './placesQuery';

let n = 0;
const ci = (venue: string, date: string, time = '', extra: Partial<PlaceCheckin> = {}): PlaceCheckin => ({ id: `c${++n}`, venue, date, time, source: 'swarm', ...extra });

const LIST = [
  ci('Cafe Nero', '2026-10-20', '09:10', { category: 'Coffee Shop', city: 'Zagreb', venueId: 'v1' }),
  ci('Office', '2026-10-20', '10:00', { category: 'Office', city: 'Zagreb' }),
  ci('Cafe Nero', '2026-10-14', '08:30', { category: 'Coffee Shop', city: 'Zagreb', venueId: 'v1' }),
  ci('Museum', '2026-10-24', '', { city: 'Vienna', country: 'Austria', shout: 'Klimt!' }),
];

describe('filterCheckins', () => {
  it('filters by inclusive date range', () => {
    expect(filterCheckins(LIST, { from: '2026-10-20', to: '2026-10-20' }).map((c) => c.venue)).toEqual(['Cafe Nero', 'Office']);
    expect(filterCheckins(LIST, { from: '2026-10-21' }).map((c) => c.venue)).toEqual(['Museum']);
  });
  it('needs every word, in the venue, category, city or note, ignoring case', () => {
    expect(filterCheckins(LIST, { query: 'COFFEE zagreb' })).toHaveLength(2);
    expect(filterCheckins(LIST, { query: 'klimt' })).toHaveLength(1);
    expect(filterCheckins(LIST, { query: 'coffee vienna' })).toHaveLength(0);
  });
  it('matches category, city and country by part of the name', () => {
    expect(filterCheckins(LIST, { category: 'coff' })).toHaveLength(2);
    expect(filterCheckins(LIST, { city: 'vien' })).toHaveLength(1);
    expect(filterCheckins(LIST, { country: 'austria' })).toHaveLength(1);
  });
});

describe('newestFirst', () => {
  it('orders by day then time, latest first, without changing the input', () => {
    const before = [...LIST];
    expect(newestFirst(LIST).map((c) => c.venue)).toEqual(['Museum', 'Office', 'Cafe Nero', 'Cafe Nero']);
    expect(LIST).toEqual(before);
  });
});

describe('venueHistory', () => {
  it('groups by place with visits, distinct days, first and last, most recent first', () => {
    const rows = venueHistory([...LIST, ci('Cafe Nero', '2026-10-20', '15:00', { venueId: 'v1', city: 'Zagreb' })]);
    expect(rows.map((r) => r.name)).toEqual(['Museum', 'Cafe Nero', 'Office']);
    const nero = rows[1];
    expect(nero).toMatchObject({ visits: 3, first: '2026-10-14', last: '2026-10-20', days: ['2026-10-14', '2026-10-20'], category: 'Coffee Shop' });
  });
});
