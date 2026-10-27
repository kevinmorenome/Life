import { describe, expect, it } from 'vitest';
import { withStatusFor } from './bulk';
import type { ClothingItem } from './types';

const item = (id: string, status: ClothingItem['status']): ClothingItem => ({
  id,
  name: id,
  category: 'tops',
  seasons: [],
  status,
  wears: ['2026-06-01'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('withStatusFor', () => {
  const items = [item('a', 'active'), item('b', 'active'), item('c', 'storage')];

  it('changes only the selected items and keeps their other fields', () => {
    const out = withStatusFor(items, new Set(['a', 'c']), 'storage', '2026-10-26T00:00:00Z');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', status: 'storage', wears: ['2026-06-01'], updatedAt: '2026-10-26T00:00:00Z' });
  });

  it('skips items already in that status', () => {
    expect(withStatusFor(items, new Set(['c']), 'storage', 'x')).toEqual([]);
  });
});
