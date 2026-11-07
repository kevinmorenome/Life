import { describe, expect, it } from 'vitest';
import { isShown, kindOfTone, parseFilter, toggleKind } from './calendarFilter';

describe('calendar filter', () => {
  it('shows everything when nothing is selected', () => {
    expect(isShown([], 'music')).toBe(true);
    expect(isShown(['place'], 'music')).toBe(false);
    expect(isShown(['place', 'music'], 'music')).toBe(true);
  });
  it('groups office, home, day off and work trip as work', () => {
    expect(['office', 'home', 'off', 'trip'].map(kindOfTone)).toEqual(['work', 'work', 'work', 'work']);
    expect(kindOfTone('music')).toBe('music');
  });
  it('toggles a kind', () => {
    expect(toggleKind([], 'music')).toEqual(['music']);
    expect(toggleKind(['music', 'place'], 'music')).toEqual(['place']);
  });
  it('reads a stored selection and ignores junk', () => {
    expect(parseFilter('["music","nope",3]')).toEqual(['music']);
    expect(parseFilter('{')).toEqual([]);
    expect(parseFilter(null)).toEqual([]);
  });
});
