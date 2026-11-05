import { describe, expect, it } from 'vitest';
import { parseTripList, tripsToImport } from './tripitImport';

// Made-up trips, in the two shapes the importer accepts.
const raw = (over: Record<string, unknown> = {}) => ({
  id: '111',
  uuid: 'aaaa-bbbb',
  start_date: '2024-05-10',
  end_date: '2024-05-13',
  display_name: 'Lisbon, Portugal, May 2024',
  primary_location: 'Lisbon, Portugal',
  PrimaryLocationAddress: { address: 'Lisbon, Portugal', city: 'Lisbon', country: 'PT' },
  ...over,
});

const NOW = '2026-11-05T10:00:00.000Z';

describe('parseTripList', () => {
  it('reads TripIt\'s own shape, as an array, a { Trip } answer or a single trip', () => {
    const one = { id: '111', name: 'Lisbon, Portugal, May 2024', start: '2024-05-10', end: '2024-05-13', place: 'Lisbon, Portugal', country: 'PT' };
    for (const input of [[raw()], { Trip: [raw()] }, { Trip: raw() }, raw()]) {
      expect(parseTripList(JSON.stringify(input))).toEqual({ trips: [one], skipped: 0 });
    }
  });

  it('reads what the browser snippet writes', () => {
    const r = parseTripList(JSON.stringify([{ id: '7', name: 'Weekend', start: '2023-02-03', end: '2023-02-05', place: 'Vienna, Austria', country: 'AT' }]));
    expect(r).toEqual({ trips: [{ id: '7', name: 'Weekend', start: '2023-02-03', end: '2023-02-05', place: 'Vienna, Austria', country: 'AT' }], skipped: 0 });
  });

  it('finds the country from its name when there is no code, and leaves it out when unknown', () => {
    const [a, b] = (parseTripList(JSON.stringify([raw({ id: '1', PrimaryLocationAddress: {}, primary_location: 'Porto, Portugal' }), raw({ id: '2', PrimaryLocationAddress: {}, primary_location: 'Somewhere' })])) as { trips: { country?: string }[] }).trips;
    expect(a.country).toBe('PT');
    expect(b.country).toBeUndefined();
  });

  it('skips entries that cannot be used, and says so', () => {
    const r = parseTripList(JSON.stringify([raw(), raw({ id: '2', start_date: 'soon' }), raw({ id: '3', end_date: '2024-05-01' }), { nope: true }, raw()]));
    // Three unusable entries, and the second copy of the same trip.
    expect(r).toMatchObject({ skipped: 4 });
    expect((r as { trips: unknown[] }).trips).toHaveLength(1);
  });

  it('explains text that is not JSON or holds no trips', () => {
    expect(parseTripList('<html>')).toHaveProperty('error');
    expect(parseTripList(JSON.stringify([{ nope: true }]))).toHaveProperty('error');
    expect(parseTripList('[]')).toEqual({ trips: [], skipped: 0 });
  });
});

describe('tripsToImport', () => {
  const t = { id: '111', name: 'Lisbon, Portugal, May 2024', start: '2024-05-10', end: '2024-05-13', place: 'Lisbon, Portugal', country: 'PT' };

  it('makes a trip with a stable id, the place and the country', () => {
    expect(tripsToImport([t], [], NOW)).toEqual([
      {
        id: 'trip-tripit-111',
        name: 'Lisbon, Portugal, May 2024',
        destination: 'Lisbon, Portugal',
        country: 'PT',
        startDate: '2024-05-10',
        endDate: '2024-05-13',
        outfitPlan: {},
        itemIds: [],
        extras: [],
        packed: [],
        tripitRef: 'tripit-trip-111',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });

  it('never doubles a trip that is already there', () => {
    expect(tripsToImport([t], [{ id: 'trip-tripit-111' }], NOW)).toEqual([]);
  });
});
