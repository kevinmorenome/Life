import { describe, expect, it } from 'vitest';
import { addChip, removeChip, withColors, withTags, withToggledColor } from './chips';

const base = { updatedAt: '2020-01-01T00:00:00.000Z', name: 'x' };

describe('chips', () => {
  it('adds without duplicates, ignoring case and blanks', () => {
    expect(addChip(['Linen'], ' linen ')).toEqual(['Linen']);
    expect(addChip(['Linen'], '   ')).toEqual(['Linen']);
    expect(addChip(['Linen'], 'Boho')).toEqual(['Linen', 'Boho']);
  });

  it('removes case-insensitively', () => {
    expect(removeChip(['Linen', 'Boho'], 'linen')).toEqual(['Boho']);
  });

  it('withColors keeps the legacy string in step and bumps updatedAt', () => {
    const next = withColors({ ...base, colors: ['Red'] }, ['Red', 'Navy']);
    expect(next.colors).toEqual(['Red', 'Navy']);
    expect(next.color).toBe('Red, Navy');
    expect(next.updatedAt > base.updatedAt).toBe(true);
    expect(withColors(base, []).colors).toBeUndefined();
  });

  it('toggles a colour, starting from the legacy string', () => {
    const legacy = { ...base, color: 'Blue, Navy' };
    expect(withToggledColor(legacy, 'Navy').colors).toEqual(['Blue']);
    expect(withToggledColor(legacy, 'Red').colors).toEqual(['Blue', 'Navy', 'Red']);
  });

  it('withTags preserves other fields', () => {
    const next = withTags({ ...base, wears: ['2020-01-01'] }, ['a']);
    expect(next.tags).toEqual(['a']);
    expect(next.wears).toEqual(['2020-01-01']);
    expect(withTags(base, []).tags).toBeUndefined();
  });
});
