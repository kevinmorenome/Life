import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, needsCheck, stockOf } from './stock';
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
