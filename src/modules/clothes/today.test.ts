import { describe, expect, it } from 'vitest';
import { missedDays, previousLoggedDay, repeatDay, suggestedOutfits } from './today';
import type { ClothingItem, Outfit } from './types';

function item(id: string, wears: string[] = []): ClothingItem {
  return { id, name: id, category: 'tops', seasons: [], status: 'active', wears, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
}
function outfit(id: string, itemIds: string[], wears: string[] = []): Outfit {
  return { id, itemIds, wears, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
}

describe('missedDays', () => {
  const items = [item('a', ['2026-10-20', '2026-10-23'])];

  it('lists unlogged days since the first wear, newest first, excluding today', () => {
    expect(missedDays(items, [], '2026-10-25')).toEqual(['2026-10-24', '2026-10-22', '2026-10-21']);
  });

  it('leaves out skipped days and respects the lookback', () => {
    expect(missedDays(items, [], '2026-10-25', ['2026-10-22'], 3)).toEqual(['2026-10-24']);
  });

  it('shows nothing before tracking started', () => {
    expect(missedDays([item('a')], [], '2026-10-25')).toEqual([]);
  });
});

describe('suggestedOutfits', () => {
  it('puts recently worn outfits first and hides ones already logged that day', () => {
    const list = [
      outfit('old', ['a'], ['2026-09-01']),
      outfit('recent', ['a'], ['2026-10-10']),
      outfit('today', ['a'], ['2026-10-25']),
      outfit('empty', []),
    ];
    expect(suggestedOutfits(list, '2026-10-25').map((o) => o.id)).toEqual(['recent', 'old']);
  });
});

describe('repeatDay', () => {
  const items = [item('a', ['2026-10-24']), item('b', ['2026-10-24']), item('c', ['2026-10-24'])];
  const outfits = [outfit('o', ['a', 'b'], ['2026-10-24'])];

  it('repeats outfits with their pieces, plus loose items', () => {
    const r = repeatDay('2026-10-24', '2026-10-25', items, outfits);
    expect(r.outfits.map((o) => o.id)).toEqual(['o']);
    expect(r.items.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
    expect(r.items.every((i) => i.wears.includes('2026-10-25'))).toBe(true);
  });

  it('skips what is already logged on the target day', () => {
    const done = [item('a', ['2026-10-24', '2026-10-25']), items[1], items[2]];
    const r = repeatDay('2026-10-24', '2026-10-25', done, [outfit('o', ['a', 'b'], ['2026-10-24', '2026-10-25'])]);
    expect(r.outfits).toEqual([]);
    expect(r.items.map((i) => i.id).sort()).toEqual(['b', 'c']);
  });

  it('does nothing for an empty day', () => {
    expect(repeatDay('2026-10-01', '2026-10-25', items, outfits)).toEqual({ outfits: [], items: [] });
  });
});

describe('previousLoggedDay', () => {
  it('finds the closest earlier logged day', () => {
    const items = [item('a', ['2026-10-21', '2026-10-23'])];
    expect(previousLoggedDay(items, [], '2026-10-25')).toBe('2026-10-23');
    expect(previousLoggedDay(items, [], '2026-11-30')).toBeNull();
  });
});
