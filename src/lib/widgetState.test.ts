import { describe, expect, it } from 'vitest';
import { parseCollapsed, serializeCollapsed, withCollapsed } from './widgetState';

describe('widget collapse state', () => {
  it('starts empty when nothing is stored or the value is damaged', () => {
    expect(parseCollapsed(null).size).toBe(0);
    expect(parseCollapsed('').size).toBe(0);
    expect(parseCollapsed('not json').size).toBe(0);
    expect(parseCollapsed('{"a":1}').size).toBe(0);
  });

  it('keeps only string ids', () => {
    expect([...parseCollapsed('["work",3,null,"food"]')].sort()).toEqual(['food', 'work']);
  });

  it('round-trips', () => {
    const ids = new Set(['places', 'food']);
    expect(parseCollapsed(serializeCollapsed(ids))).toEqual(ids);
  });

  it('collapses and expands without touching the original', () => {
    const a = new Set(['food']);
    const b = withCollapsed(a, 'work', true);
    expect([...b].sort()).toEqual(['food', 'work']);
    expect([...a]).toEqual(['food']);
    expect([...withCollapsed(b, 'food', false)]).toEqual(['work']);
  });
});
