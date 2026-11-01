import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatAmount, levelOptions, needsCheck, partLeft, stockOf, usesSince } from './stock';
import type { StockEvent } from './types';

const buy = (date: string, quantity: number) => ({ date, quantity });
let n = 0;
const ev = (type: StockEvent['type'], quantity: number, date: string, createdAt = `${date}T10:00:0${n++ % 10}`): StockEvent => ({
  id: `e${n}`, productId: 'p', type, quantity, date, source: 'app', createdAt, updatedAt: createdAt,
});
const staple = { type: 'staple' as const };

describe('dates', () => {
  it('add and count days across months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(daysBetween('2026-10-31', '2026-11-03')).toBe(3);
  });
});

describe('stockOf', () => {
  it('is what was bought minus what was used', () => {
    const s = stockOf(staple, [buy('2026-10-01', 6)], [ev('use', 1, '2026-10-02'), ev('use', 2, '2026-10-03')], '2026-10-05');
    expect(s.quantity).toBe(3);
    expect(s.status).toBe('ok');
  });

  it('uses the oldest purchase first', () => {
    const s = stockOf(staple, [buy('2026-10-01', 2), buy('2026-10-10', 2)], [ev('use', 3, '2026-10-11')], '2026-10-12');
    expect(s.batches).toEqual([{ date: '2026-10-10', quantity: 1 }]);
  });

  it('never goes below zero', () => {
    const s = stockOf(staple, [buy('2026-10-01', 1)], [ev('use', 5, '2026-10-02')], '2026-10-03');
    expect(s.quantity).toBe(0);
    expect(s.status).toBe('out');
  });

  it('restarts from the last count and ignores what came before it', () => {
    const events = [ev('use', 1, '2026-10-02'), ev('count', 4, '2026-10-05'), ev('use', 1, '2026-10-06')];
    const s = stockOf(staple, [buy('2026-10-01', 6), buy('2026-10-08', 2)], events, '2026-10-09');
    expect(s.quantity).toBe(5); // counted 4, minus 1 used, plus 2 bought after the count
  });

  it('counts a purchase on the day of a count as already included in the count', () => {
    const s = stockOf(staple, [buy('2026-10-05', 2)], [ev('count', 2, '2026-10-05')], '2026-10-06');
    expect(s.quantity).toBe(2);
  });

  it('applies a use recorded at the same moment as a count, but not one recorded before it on that day', () => {
    const count = ev('count', 4, '2026-10-05', '2026-10-05T10:00:00.000Z');
    expect(stockOf(staple, [], [count, ev('use', 1, '2026-10-05', '2026-10-05T10:00:00.000Z')], '2026-10-06').quantity).toBe(3);
    expect(stockOf(staple, [], [count, ev('use', 1, '2026-10-05', '2026-10-05T09:00:00.000Z')], '2026-10-06').quantity).toBe(4);
  });

  it('a count of 0 means finished', () => {
    const s = stockOf(staple, [buy('2026-10-01', 3)], [ev('count', 0, '2026-10-04')], '2026-10-05');
    expect(s).toMatchObject({ quantity: 0, status: 'out' });
  });

  it('flags staples and drinks that are down to the last one', () => {
    expect(stockOf(staple, [buy('2026-10-01', 2)], [ev('use', 1, '2026-10-02')], '2026-10-03').status).toBe('low');
    expect(stockOf({ type: 'drink' }, [buy('2026-10-01', 4)], [], '2026-10-03').status).toBe('ok');
  });

  describe('fresh', () => {
    const fresh = { type: 'fresh' as const, shelfLifeDays: 2 };
    it('is use-by the oldest batch plus its shelf life, and "use soon" the day before', () => {
      expect(stockOf(fresh, [buy('2026-10-31', 1)], [], '2026-10-31')).toMatchObject({ useBy: '2026-11-02', status: 'ok' });
      expect(stockOf(fresh, [buy('2026-10-31', 1)], [], '2026-11-01').status).toBe('use-soon');
      expect(stockOf(fresh, [buy('2026-10-31', 1)], [], '2026-11-02').status).toBe('use-soon');
      expect(stockOf({ type: 'fresh', shelfLifeDays: 7 }, [buy('2026-10-31', 1)], [], '2026-11-01').status).toBe('ok');
    });
    it('needs a check once past its use-by date, and only the oldest batch counts', () => {
      const s = stockOf(fresh, [buy('2026-10-20', 1), buy('2026-10-31', 1)], [], '2026-11-01');
      expect(s.status).toBe('check');
      expect(needsCheck('fresh', s, '2026-11-01')).toBe(true);
    });
    it('falls back to five days without a shelf life', () => {
      expect(stockOf({ type: 'fresh' }, [buy('2026-10-31', 1)], [], '2026-10-31').useBy).toBe('2026-11-05');
    });
  });

  it('assumes snacks are eaten after a few days', () => {
    const snack = { type: 'snack' as const };
    expect(stockOf(snack, [buy('2026-10-31', 1)], [], '2026-11-01').quantity).toBe(1);
    expect(stockOf(snack, [buy('2026-10-31', 1)], [], '2026-11-10')).toMatchObject({ quantity: 0, status: 'out' });
  });
});

describe('needsCheck', () => {
  it('asks about things nothing has confirmed for a while, depending on the type', () => {
    const s = stockOf(staple, [buy('2026-10-01', 3)], [], '2026-10-20');
    expect(needsCheck('staple', s, '2026-10-10')).toBe(false);
    expect(needsCheck('staple', s, '2026-10-20')).toBe(true);
    expect(needsCheck('snack', s, '2026-12-01')).toBe(false);
  });
  it('a count counts as a confirmation, and nothing is asked about what is gone', () => {
    const counted = stockOf(staple, [buy('2026-10-01', 3)], [ev('count', 2, '2026-10-18')], '2026-10-20');
    expect(needsCheck('staple', counted, '2026-10-20')).toBe(false);
    const gone = stockOf(staple, [buy('2026-10-01', 3)], [ev('count', 0, '2026-10-18')], '2026-10-30');
    expect(needsCheck('staple', gone, '2026-10-30')).toBe(false);
  });
});

describe('part left', () => {
  it('lowers the open pack and keeps the unopened ones whole', () => {
    expect(partLeft(2, 'pc', 0.5)).toBe(1.5);
    expect(partLeft(1, 'pc', 0.5)).toBe(0.5);
    expect(partLeft(1.5, 'pc', 0.25)).toBe(1.25);
    expect(partLeft(3, 'pc', 0.1)).toBe(2.1);
  });
  it('takes a fraction of what you have for weighed and poured goods', () => {
    expect(partLeft(0.48, 'kg', 0.5)).toBe(0.24);
    expect(partLeft(1, 'l', 0.25)).toBe(0.25);
  });
  it('never raises the stock, and nothing from nothing', () => {
    expect(partLeft(1.25, 'pc', 0.75)).toBe(1.25);
    expect(partLeft(0, 'pc', 0.5)).toBe(0);
  });
  it('only offers levels below how full the open pack already is', () => {
    expect(levelOptions(2, 'pc').map((l) => l.fraction)).toEqual([0.75, 0.5, 0.25, 0.1]);
    expect(levelOptions(1.5, 'pc').map((l) => l.fraction)).toEqual([0.25, 0.1]);
    expect(levelOptions(1.1, 'pc')).toEqual([]);
    expect(levelOptions(0, 'pc')).toEqual([]);
    expect(levelOptions(0.5, 'kg').map((l) => l.fraction)).toEqual([0.75, 0.5, 0.25, 0.1]);
  });
  it('shows pieces in quarters and everything else as decimals', () => {
    expect(['0.5', '1.5', '0.25', '2.75', '2', '0.1'].map((q) => formatAmount(Number(q), 'pc'))).toEqual(['½', '1½', '¼', '2¾', '2', '0.1']);
    expect(formatAmount(0.5, 'kg')).toBe('0.5');
  });
  it('is what stock then shows after a use of the difference', () => {
    const used = 2 - partLeft(2, 'pc', 0.5);
    expect(stockOf(staple, [buy('2026-10-01', 2)], [ev('use', used, '2026-10-02')], '2026-10-03')).toMatchObject({ quantity: 1.5, status: 'ok' });
    expect(stockOf(staple, [buy('2026-10-01', 1)], [ev('use', 0.5, '2026-10-02')], '2026-10-03').status).toBe('low');
  });
});

describe('products you only have or do not (spices)', () => {
  const spice = { type: 'staple' as const, trackAmount: false };
  it('are in stock from the first purchase and uses change nothing', () => {
    const s = stockOf(spice, [buy('2026-10-01', 1)], [ev('use', 1, '2026-10-02'), ev('use', 1, '2026-10-03'), ev('use', 1, '2026-10-04')], '2026-11-01');
    expect(s).toMatchObject({ tracked: false, quantity: 1, status: 'ok' });
    expect(s.batches).toEqual([{ date: '2026-10-01', quantity: 1 }]);
  });
  it('are out once finished or thrown away, and back after buying it again', () => {
    expect(stockOf(spice, [buy('2026-10-01', 1)], [ev('count', 0, '2026-10-20')], '2026-11-01')).toMatchObject({ quantity: 0, status: 'out' });
    expect(stockOf(spice, [buy('2026-10-01', 1)], [ev('toss', 1, '2026-10-20')], '2026-11-01').quantity).toBe(0);
    expect(stockOf(spice, [buy('2026-10-01', 1), buy('2026-10-25', 1)], [ev('count', 0, '2026-10-20')], '2026-11-01').quantity).toBe(1);
  });
  it('a purchase on the day it was finished does not bring it back, a count above zero does', () => {
    expect(stockOf(spice, [buy('2026-10-20', 1)], [ev('count', 0, '2026-10-20')], '2026-11-01').quantity).toBe(0);
    expect(stockOf(spice, [], [ev('count', 0, '2026-10-20'), ev('count', 1, '2026-10-22')], '2026-11-01').quantity).toBe(1);
  });
  it('are never "low" and never asked about in the weekly check', () => {
    const s = stockOf(spice, [buy('2026-01-01', 1)], [], '2026-11-01');
    expect(s.status).toBe('ok');
    expect(needsCheck('staple', s, '2026-11-01')).toBe(false);
  });
  it('can still count how often they were used', () => {
    const events = [ev('use', 1, '2026-10-02'), ev('use', 1, '2026-10-10'), ev('count', 1, '2026-10-12'), ev('use', 1, '2026-10-15')];
    expect(usesSince(events)).toBe(3);
    expect(usesSince(events, '2026-10-10')).toBe(2);
  });
});
