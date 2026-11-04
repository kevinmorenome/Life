import { describe, expect, it } from 'vitest';
import { allSelected, pruned, toggled, toggledAll } from './selection';

describe('toggled', () => {
  it('ticks and unticks without changing the original', () => {
    const none = new Set<string>();
    const one = toggled(none, 'a');
    expect([...one]).toEqual(['a']);
    expect(none.size).toBe(0);
    expect(toggled(one, 'a').size).toBe(0);
    expect([...toggled(one, 'b')]).toEqual(['a', 'b']);
  });
});

describe('allSelected', () => {
  it('needs every id ticked, and something to tick', () => {
    expect(allSelected(new Set(['a', 'b']), ['a', 'b'])).toBe(true);
    expect(allSelected(new Set(['a']), ['a', 'b'])).toBe(false);
    expect(allSelected(new Set(['a']), [])).toBe(false);
  });
});

describe('toggledAll', () => {
  it('ticks everything when something is missing, keeping other ticks', () => {
    expect([...toggledAll(new Set(['x', 'a']), ['a', 'b'])].sort()).toEqual(['a', 'b', 'x']);
  });
  it('clears just those ids when all are ticked', () => {
    expect([...toggledAll(new Set(['x', 'a', 'b']), ['a', 'b'])]).toEqual(['x']);
  });
});

describe('pruned', () => {
  it('drops ids that no longer exist', () => {
    expect([...pruned(new Set(['a', 'gone']), ['a', 'b'])]).toEqual(['a']);
  });
});
