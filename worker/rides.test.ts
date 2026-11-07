import { describe, expect, it } from 'vitest';
import { parseRides } from './rides';

describe('parseRides', () => {
  it('validates, defaults the currency and drops duplicates', () => {
    const { rides, rejected } = parseRides(
      [
        { provider: 'Bolt', sourceId: 'a 1', date: '2026-05-03', time: '22:36', from: ' Ilica 1 ', to: 'Airport', fare: 7.234, currency: 'eur', distanceKm: 6.5, durationMin: 14 },
        { provider: 'bolt', sourceId: 'a1', date: '2026-05-03', fare: 1 },
        { provider: 'uber', sourceId: 'a1', date: '2026-05-04', time: '25:00', fare: 12, distanceKm: -3 },
        { provider: 'lyft', sourceId: 'x', date: '2026-05-04', fare: 5 },
        { provider: 'uber', sourceId: 'bad', date: '2026-02-31', fare: 5 },
        { provider: 'uber', sourceId: 'future', date: '2027-01-01', fare: 5 },
        'nope',
      ],
      '2026-11-03',
    );
    expect(rides).toEqual([
      { id: 'ride-bolt-a1', provider: 'bolt', date: '2026-05-03', time: '22:36', from: 'Ilica 1', to: 'Airport', fare: 7.23, currency: 'EUR', distanceKm: 6.5, durationMin: 14, city: undefined },
      { id: 'ride-uber-a1', provider: 'uber', date: '2026-05-04', time: undefined, from: undefined, to: undefined, fare: 12, currency: 'EUR', distanceKm: undefined, durationMin: undefined, city: undefined },
    ]);
    expect(rejected).toHaveLength(4);
  });
  it('ignores non-arrays', () => expect(parseRides('x', '2026-11-03')).toEqual({ rides: [], rejected: [] }));
});
