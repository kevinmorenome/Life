import { describe, expect, it } from 'vitest';
import { daysInCloset } from './stats';
import { storedDays, withStatus } from './storage';
import type { ClothingItem } from './types';

const base: ClothingItem = {
  id: 'a',
  name: 'Shorts',
  category: 'bottoms',
  seasons: ['summer'],
  status: 'active',
  wears: [],
  purchaseDate: '2026-01-01',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('withStatus', () => {
  it('opens a stored period when put away and closes it when brought back', () => {
    const away = withStatus(base, 'storage', '2026-10-01');
    expect(away.storedPeriods).toEqual([{ from: '2026-10-01' }]);
    const back = withStatus(away, 'active', '2026-10-11');
    expect(back.storedPeriods).toEqual([{ from: '2026-10-01', to: '2026-10-11' }]);
  });

  it('is a no-op when the status is unchanged', () => {
    expect(withStatus(base, 'active', '2026-10-01')).toBe(base);
  });

  it('closes the spell when an item in storage is donated', () => {
    const gone = withStatus(withStatus(base, 'storage', '2026-10-01'), 'donated', '2026-10-05');
    expect(gone.storedPeriods).toEqual([{ from: '2026-10-01', to: '2026-10-05' }]);
  });
});

describe('time put away', () => {
  it('counts an open spell until today and sums closed ones', () => {
    const item = { ...base, storedPeriods: [{ from: '2026-02-01', to: '2026-02-11' }, { from: '2026-10-20' }] };
    expect(storedDays(item, '2026-10-25')).toBe(15);
  });

  it('stops "in the closet" growing while stored', () => {
    const away = withStatus(base, 'storage', '2026-10-01');
    const before = daysInCloset(away, '2026-10-10');
    expect(daysInCloset(away, '2026-12-10')).toBe(before);
  });
});
