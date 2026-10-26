import { describe, expect, it } from 'vitest';
import { colorSwatches, itemColors } from './colors';

describe('colorSwatches', () => {
  it('splits comma and ampersand lists and keeps the original names', () => {
    expect(colorSwatches('Blue, Navy blue & Red').map((s) => s.name)).toEqual(['Blue', 'Navy blue', 'Red']);
  });

  it('matches known colours case-insensitively and leaves unknown ones without a dot colour', () => {
    const [blue, odd] = colorSwatches('BLUE, Periwinkle');
    expect(blue.css).toBe('#1f3cff');
    expect(odd.css).toBeNull();
  });

  it('gives Multicolor a gradient', () => {
    expect(colorSwatches('Multicolor')[0].css).toContain('conic-gradient');
  });

  it('returns nothing for an empty field', () => {
    expect(colorSwatches(undefined)).toEqual([]);
    expect(colorSwatches(' , ')).toEqual([]);
  });
});

describe('itemColors', () => {
  it('prefers the stored list', () => {
    expect(itemColors({ colors: ['Red'], color: 'Blue' })).toEqual(['Red']);
  });

  it('falls back to the legacy string', () => {
    expect(itemColors({ color: 'Blue & Navy' })).toEqual(['Blue', 'Navy']);
    expect(itemColors({})).toEqual([]);
  });
});
