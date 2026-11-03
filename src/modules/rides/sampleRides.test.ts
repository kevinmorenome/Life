import { describe, expect, it } from 'vitest';
import { sampleRides } from './sampleRides';

describe('sampleRides', () => {
  const now = new Date(2026, 10, 3, 12);
  const rides = sampleRides(now);
  it('has unique ids, past dates and both apps', () => {
    expect(new Set(rides.map((r) => r.id)).size).toBe(rides.length);
    expect(rides.every((r) => r.date < '2026-11-03' && r.fare > 0)).toBe(true);
    expect(new Set(rides.map((r) => r.provider))).toEqual(new Set(['bolt', 'uber']));
    expect(rides.some((r) => r.currency !== 'EUR')).toBe(true);
  });
  it('is stable for the same day', () => expect(sampleRides(now)).toEqual(rides));
});
