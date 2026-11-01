import { describe, expect, it } from 'vitest';
import { parentRoute } from './backRoute';

const p = (path: string) => parentRoute(path.split('/').filter(Boolean));

describe('parentRoute', () => {
  it('goes from a food receipt to the list, and from the list to More', () => {
    expect(p('/food/receipt/food-abc')).toBe('/food');
    expect(p('/food')).toBe('/more');
  });

  it('has no parent on the main pages', () => {
    for (const path of ['/', '/calendar', '/calendar/2026-10', '/stats', '/stats/clothes', '/more', '/clothes', '/clothes/outfits', '/clothes/review']) {
      expect(p(path)).toBeUndefined();
    }
  });
  it('goes from items to the closet and from the editor to the item', () => {
    expect(p('/clothes/abc')).toBe('/clothes');
    expect(p('/clothes/new')).toBe('/clothes');
    expect(p('/clothes/abc/edit')).toBe('/clothes/abc');
  });
  it('handles outfits', () => {
    expect(p('/clothes/outfits/o1')).toBe('/clothes/outfits');
    expect(p('/clothes/outfits/new')).toBe('/clothes/outfits');
    expect(p('/clothes/outfits/o1/edit')).toBe('/clothes/outfits/o1');
  });
  it('handles days and their pickers', () => {
    expect(p('/calendar/2026-10-29')).toBe('/calendar');
    expect(p('/clothes/calendar/2026-10-29/outfit')).toBe('/calendar/2026-10-29');
    expect(p('/clothes/today')).toBe('/calendar');
  });
  it('handles trips and settings', () => {
    expect(p('/packing')).toBe('/more');
    expect(p('/packing/new')).toBe('/packing');
    expect(p('/packing/t1')).toBe('/packing');
    expect(p('/packing/t1/outfits')).toBe('/packing');
    expect(p('/packing/t1/edit')).toBe('/packing/t1');
    expect(p('/packing/t1/day/2026-10-29')).toBe('/packing/t1');
    expect(p('/settings')).toBe('/more');
    expect(p('/settings/closet-review')).toBe('/settings');
    expect(p('/settings/closet-review/season')).toBe('/settings/closet-review');
  });
});
