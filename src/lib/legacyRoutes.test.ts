import { describe, expect, it } from 'vitest';
import { legacyRedirect } from './legacyRoutes';

const go = (path: string) => legacyRedirect(path.split('/').filter(Boolean));

describe('legacyRedirect', () => {
  it('moves the clothes calendar to the app calendar', () => {
    expect(go('/clothes/calendar')).toBe('/calendar');
    expect(go('/clothes/calendar/2026-10')).toBe('/calendar/2026-10');
    expect(go('/clothes/calendar/2026-10-29')).toBe('/calendar/2026-10-29');
  });

  it('leaves the pickers under a calendar day alone', () => {
    expect(go('/clothes/calendar/2026-10-29/outfit')).toBeNull();
    expect(go('/clothes/calendar/2026-10-29/items')).toBeNull();
  });

  it('moves stats under /stats', () => {
    expect(go('/clothes/stats')).toBe('/stats/clothes');
    expect(go('/clothes/stats/spending')).toBe('/stats/clothes/spending');
    expect(go('/work/stats')).toBe('/stats/work');
  });

  it('folds the office pages into the calendar', () => {
    expect(go('/work')).toBe('/calendar');
    expect(go('/work/calendar/2026-09')).toBe('/calendar/2026-09');
    expect(go('/work/day/2026-10-07')).toBe('/calendar/2026-10-07');
  });

  it('ignores current routes', () => {
    for (const path of ['/', '/calendar', '/stats/clothes', '/clothes', '/clothes/outfits', '/packing/abc', '/settings']) {
      expect(go(path)).toBeNull();
    }
  });
});
