import { describe, expect, it } from 'vitest';
import { addDays, batchesToCheck, daysBetween, formatAmount, levelOptions, needsBatchCheck, needsCheck, originBatch, partLeft, stockOf, usesSince } from './stock';
import type { StockEvent } from './types';
import { usedEarlierEvent } from './stockActions';

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
    expect([0.908, 0.224, 1, 0.004].map((q) => formatAmount(q, 'kg'))).toEqual(['0.91', '0.22', '1', '0.004']);
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

describe('packs (a 6-pack of beer is bought as 1 and drunk as 6)', () => {
  const beer = { type: 'drink' as const, packSize: 6 };
  it('counts in items: each pack bought adds its size', () => {
    expect(stockOf(beer, [buy('2026-10-31', 2)], [], '2026-11-01').quantity).toBe(12);
  });
  it('takes single items off, oldest pack first', () => {
    const s = stockOf(beer, [buy('2026-10-01', 1), buy('2026-10-20', 1)], [ev('use', 8, '2026-10-21')], '2026-10-22');
    expect(s.quantity).toBe(4);
    expect(s.batches).toEqual([{ date: '2026-10-20', quantity: 4 }]);
  });
  it('a count is in items, and later packs add on top of it', () => {
    const s = stockOf(beer, [buy('2026-10-01', 2), buy('2026-10-25', 1)], [ev('count', 3, '2026-10-20')], '2026-10-26');
    expect(s.quantity).toBe(9);
  });
  it('is low at the last item, like any drink', () => {
    expect(stockOf(beer, [buy('2026-10-01', 1)], [ev('use', 5, '2026-10-02')], '2026-10-03').status).toBe('low');
  });
  it('has no "part left" levels, since an item is not partly used', () => {
    expect(levelOptions(12, 'pc', 6)).toEqual([]);
    expect(levelOptions(1.5, 'pc', 1).length).toBeGreaterThan(0);
    expect(levelOptions(1.5, 'pc', undefined).length).toBeGreaterThan(0);
  });
  it('is ignored for products you only have or do not', () => {
    expect(stockOf({ type: 'staple', trackAmount: false, packSize: 6 }, [buy('2026-10-01', 2)], [], '2026-10-02').quantity).toBe(1);
  });
  it('a pack size of 1 or nothing changes nothing', () => {
    expect(stockOf({ type: 'staple', packSize: 1 }, [buy('2026-10-01', 2)], [], '2026-10-02').quantity).toBe(2);
    expect(stockOf({ type: 'staple' }, [buy('2026-10-01', 2)], [], '2026-10-02').quantity).toBe(2);
  });
});

describe('batches (each purchase has its own use-by and can be acted on alone)', () => {
  const chicken = { type: 'fresh' as const, shelfLifeDays: 3 };
  // 1.87 kg of chicken from three purchases: 0.62 + 0.5 + 0.75
  const bought = [
    { date: '2026-10-28', quantity: 0.62, batch: 'a:0' },
    { date: '2026-10-30', quantity: 0.5, batch: 'b:0' },
    { date: '2026-11-01', quantity: 0.75, batch: 'c:0' },
  ];
  const batchEv = (type: StockEvent['type'], batch: string, quantity: number, date: string, extra: Partial<StockEvent> = {}): StockEvent => ({ ...ev(type, quantity, date), batch, ...extra });

  it('keeps one batch per purchase, each with its own use-by', () => {
    const s = stockOf(chicken, bought, [], '2026-11-01');
    expect(s.quantity).toBe(1.87);
    expect(s.batches).toEqual([
      { id: 'a:0', date: '2026-10-28', quantity: 0.62, useBy: '2026-10-31' },
      { id: 'b:0', date: '2026-10-30', quantity: 0.5, useBy: '2026-11-02' },
      { id: 'c:0', date: '2026-11-01', quantity: 0.75, useBy: '2026-11-04' },
    ]);
    expect(s.useBy).toBe('2026-10-31'); // the first to go off
    expect(s.status).toBe('check'); // and it is past
  });

  it('uses part of one batch and leaves the others alone', () => {
    const s = stockOf(chicken, bought, [batchEv('use', 'c:0', 0.25, '2026-11-01')], '2026-11-01');
    expect(s.batches.map((b) => [b.id, b.quantity])).toEqual([['a:0', 0.62], ['b:0', 0.5], ['c:0', 0.5]]);
  });

  it('throws out just the batch that went off', () => {
    const s = stockOf(chicken, bought, [batchEv('toss', 'a:0', 0.62, '2026-11-01')], '2026-11-01');
    expect(s.quantity).toBe(1.25);
    expect(s.batches.map((b) => b.id)).toEqual(['b:0', 'c:0']);
    expect(s.status).toBe('use-soon');
  });

  it('takes more than a batch has only from that batch', () => {
    const s = stockOf(chicken, bought, [batchEv('use', 'b:0', 5, '2026-11-01')], '2026-11-01');
    expect(s.batches.map((b) => b.id)).toEqual(['a:0', 'c:0']);
    expect(s.quantity).toBe(1.37);
  });

  it('a use with no batch comes off the batch that expires first', () => {
    const s = stockOf(chicken, bought, [ev('use', 0.7, '2026-11-01')], '2026-11-01');
    expect(s.batches.map((b) => [b.id, b.quantity])).toEqual([['b:0', 0.42], ['c:0', 0.75]]);
  });

  it('a use-by set by hand replaces the default, and decides which batch goes first', () => {
    const events = [batchEv('expiry', 'c:0', 0, '2026-11-01', { useBy: '2026-10-29' })];
    const s = stockOf(chicken, bought, [...events, ev('use', 0.5, '2026-11-01')], '2026-11-01');
    expect(s.batches.find((b) => b.id === 'c:0')).toMatchObject({ useBy: '2026-10-29', quantity: 0.25 });
    expect(s.batches.map((b) => b.id)).toEqual(['a:0', 'b:0', 'c:0']);
  });

  it('the newest use-by set for a batch wins', () => {
    const first = batchEv('expiry', 'a:0', 0, '2026-10-29', { useBy: '2026-11-10', createdAt: '2026-10-29T09:00:00Z' });
    const second = batchEv('expiry', 'a:0', 0, '2026-10-30', { useBy: '2026-11-20', createdAt: '2026-10-30T09:00:00Z' });
    expect(stockOf(chicken, bought, [second, first], '2026-11-01').batches[0].useBy).toBe('2026-11-20');
  });

  it('a count of one batch puts it back, which is how an undo works', () => {
    const toss = batchEv('toss', 'a:0', 0.62, '2026-11-01', { createdAt: '2026-11-01T10:00:00Z' });
    const undo = batchEv('count', 'a:0', 0.62, '2026-11-01', { createdAt: '2026-11-01T10:00:05Z' });
    const s = stockOf(chicken, bought, [toss, undo], '2026-11-01');
    expect(s.batches[0]).toEqual({ id: 'a:0', date: '2026-10-28', quantity: 0.62, useBy: '2026-10-31' });
  });

  it('a count of the whole product keeps the batches and takes the difference from the oldest', () => {
    const s = stockOf(chicken, bought, [ev('count', 1.4, '2026-11-01')], '2026-11-01');
    expect(s.quantity).toBe(1.4);
    expect(Object.fromEntries(s.batches.map((b) => [b.id, b.quantity]))).toEqual({ 'a:0': 0.15, 'b:0': 0.5, 'c:0': 0.75 });
  });

  it('a count above what there is adds a batch of the difference', () => {
    const s = stockOf(chicken, bought, [ev('count', 2, '2026-11-01')], '2026-11-01');
    expect(s.quantity).toBe(2);
    expect(s.batches.at(-1)).toMatchObject({ date: '2026-11-01', quantity: 0.13 });
  });

  it('a count confirms what had gone past its use-by: it starts again from the count', () => {
    const s = stockOf(chicken, bought, [ev('count', 1.87, '2026-11-01')], '2026-11-01');
    expect(s.batches.find((b) => b.id === 'a:0')).toMatchObject({ date: '2026-11-01', useBy: '2026-11-04' });
    expect(s.batches.find((b) => b.id === 'b:0')?.useBy).toBe('2026-11-02'); // not past, left alone
  });

  it('counts in items for multipacks, per batch too', () => {
    const beer = { type: 'drink' as const, packSize: 6 };
    const s = stockOf(beer, [{ date: '2026-10-01', quantity: 1, batch: 'x:0' }, { date: '2026-10-05', quantity: 2, batch: 'y:0' }], [batchEv('use', 'y:0', 3, '2026-10-06')], '2026-10-07');
    expect(s.batches.map((b) => [b.id, b.quantity])).toEqual([['x:0', 6], ['y:0', 9]]);
  });
});

describe('freezer', () => {
  const chicken = { type: 'fresh' as const, shelfLifeDays: 3 };
  const bought = [{ date: '2026-10-30', quantity: 1.5, batch: 'a:0' }, { date: '2026-11-01', quantity: 0.5, batch: 'b:0' }];
  const fev = (type: 'freeze' | 'thaw', batch: string | undefined, quantity: number, date: string, id: string): StockEvent => ({
    id, productId: 'p', type, quantity, date, source: 'app', createdAt: `${date}T10:00:00Z`, updatedAt: '', ...(batch ? { batch } : {}),
  });

  it('puts part of a batch in the freezer and extends its use-by to the freezer life', () => {
    const s = stockOf(chicken, bought, [fev('freeze', 'a:0', 0.9, '2026-11-01', 'f1')], '2026-11-01');
    expect(s.quantity).toBe(2);
    expect(s.frozenQuantity).toBe(0.9);
    expect(s.batches).toEqual([
      { id: 'a:0', date: '2026-10-30', quantity: 0.6, useBy: '2026-11-02' },
      { id: 'freeze-f1:a:0', date: '2026-10-30', quantity: 0.9, useBy: '2027-01-30', frozen: '2026-11-01' },
      { id: 'b:0', date: '2026-11-01', quantity: 0.5, useBy: '2026-11-04' },
    ]);
  });

  it('the first to go off is still the one in the fridge, so the product stays flagged by it', () => {
    const s = stockOf(chicken, bought, [fev('freeze', 'a:0', 1.5, '2026-11-01', 'f1')], '2026-11-01');
    expect(s.useBy).toBe('2026-11-04'); // b:0 in the fridge; the frozen batch is months away
    expect(s.status).toBe('ok');
  });

  it('froze everything: it is all in the freezer and is no longer "past its date"', () => {
    const s = stockOf(chicken, bought.slice(0, 1), [fev('freeze', 'a:0', 5, '2026-11-05', 'f1')], '2026-11-06');
    expect(s.quantity).toBe(1.5);
    expect(s.frozenQuantity).toBe(1.5);
    expect(s.status).toBe('ok');
    expect(s.batches).toHaveLength(1);
  });

  it('takes out of the freezer: a short use-by from the day it was taken out', () => {
    const events = [fev('freeze', 'a:0', 1.5, '2026-10-31', 'f1'), fev('thaw', 'freeze-f1:a:0', 0.5, '2026-12-01', 't1')];
    const s = stockOf(chicken, bought.slice(0, 1), events, '2026-12-02');
    expect(s.frozenQuantity).toBe(1);
    const thawed = s.batches.find((b) => b.id === 'thaw-t1:freeze-f1:a:0');
    expect(thawed).toMatchObject({ quantity: 0.5, useBy: '2026-12-03' });
    expect(thawed?.frozen).toBeUndefined();
    expect(s.status).toBe('use-soon');
  });

  it('a use-by set by hand on the frozen batch wins, and a batch that is not in that state is left alone', () => {
    const events = [fev('freeze', 'a:0', 1, '2026-11-01', 'f1'), { ...fev('freeze', 'a:0', 0.1, '2026-11-01', 'f2'), createdAt: '2026-11-01T11:00:00Z' }, { ...fev('thaw', 'b:0', 1, '2026-11-01', 't1'), createdAt: '2026-11-01T12:00:00Z' }];
    const s = stockOf(chicken, bought, [...events, { ...fev('freeze', 'freeze-f1:a:0', 0, '2026-11-01', 'x'), type: 'expiry', useBy: '2026-12-25', batch: 'freeze-f1:a:0', createdAt: '2026-11-01T13:00:00Z' }], '2026-11-02');
    expect(s.batches.find((b) => b.id === 'freeze-f1:a:0')?.useBy).toBe('2026-12-25');
    expect(s.batches.find((b) => b.id === 'b:0')?.quantity).toBe(0.5); // thawing something that is not frozen does nothing
    expect(s.frozenQuantity).toBe(1.1);
  });

  it('freezing with no batch named takes from what expires first, across batches', () => {
    const s = stockOf(chicken, bought, [fev('freeze', undefined, 1.8, '2026-11-01', 'f1')], '2026-11-01');
    expect(s.frozenQuantity).toBe(1.8);
    expect(s.batches.filter((b) => !b.frozen).map((b) => [b.id, b.quantity])).toEqual([['b:0', 0.2]]);
  });

  it('what is used from a mixed product comes out of the fridge first', () => {
    const events = [fev('freeze', 'a:0', 1, '2026-11-01', 'f1'), { ...fev('freeze', undefined, 0, '2026-11-01', 'u'), type: 'use' as const, quantity: 0.6, createdAt: '2026-11-01T11:00:00Z' }];
    const s = stockOf(chicken, bought, events, '2026-11-01');
    expect(s.frozenQuantity).toBe(1);
    expect(s.batches.find((b) => b.id === 'a:0')).toBeUndefined(); // all 0.5 of it used up
    expect(s.batches.find((b) => b.id === 'b:0')?.quantity).toBe(0.4); // then 0.1 from the next one in the fridge
    expect(s.quantity).toBe(1.4);
  });

  it('undoing a freeze with batch counts puts everything back', () => {
    const freeze = fev('freeze', 'a:0', 0.9, '2026-11-01', 'f1');
    const back = [{ ...fev('freeze', 'a:0', 0, '2026-11-01', 'c1'), type: 'count' as const, quantity: 1.5, createdAt: '2026-11-01T11:00:00Z' }, { ...fev('freeze', 'freeze-f1:a:0', 0, '2026-11-01', 'c2'), type: 'count' as const, quantity: 0, batch: 'freeze-f1:a:0', createdAt: '2026-11-01T11:00:01Z' }];
    const s = stockOf(chicken, bought, [freeze, ...back], '2026-11-01');
    expect(s.frozenQuantity).toBe(0);
    expect(s.batches.find((b) => b.id === 'a:0')).toMatchObject({ quantity: 1.5, useBy: '2026-11-02' });
  });

  it('frozen snacks are not assumed eaten, and the weekly check leaves frozen things alone for a while', () => {
    const snack = { type: 'snack' as const };
    const s = stockOf(snack, [{ date: '2026-10-01', quantity: 2, batch: 's:0' }], [fev('freeze', 's:0', 2, '2026-10-02', 'f1')], '2026-12-01');
    expect(s.quantity).toBe(2);
    expect(needsCheck('fresh', stockOf(chicken, bought.slice(0, 1), [fev('freeze', 'a:0', 1.5, '2026-11-01', 'f1')], '2026-11-20'), '2026-11-20')).toBe(false);
    expect(needsCheck('fresh', stockOf(chicken, bought.slice(0, 1), [fev('freeze', 'a:0', 1.5, '2026-11-01', 'f1')], '2027-01-10'), '2027-01-10')).toBe(true);
  });

  it('follows a frozen or thawed batch back to the purchase', () => {
    expect(originBatch('freeze-f1:a:0')).toBe('a:0');
    expect(originBatch('thaw-t1:freeze-f1:a:0')).toBe('a:0');
    expect(originBatch('a:0')).toBe('a:0');
  });
});

describe('thawed food is not frozen again', () => {
  const chicken = { type: 'fresh' as const, shelfLifeDays: 3 };
  const bought = [{ date: '2026-10-30', quantity: 2, batch: 'a:0' }];
  const e = (type: StockEvent['type'], batch: string | undefined, quantity: number, date: string, id: string): StockEvent => ({
    id, productId: 'p', type, quantity, date, source: 'app', createdAt: `${date}T10:00:00Z`, updatedAt: '', ...(batch ? { batch } : {}),
  });
  const thawedOnce = [e('freeze', 'a:0', 2, '2026-10-31', 'f1'), e('thaw', 'freeze-f1:a:0', 1, '2026-11-20', 't1')];

  it('marks what was taken out, and keeps the rest frozen', () => {
    const s = stockOf(chicken, bought, thawedOnce, '2026-11-20');
    expect(s.thawedQuantity).toBe(1);
    expect(s.frozenQuantity).toBe(1);
    expect(s.batches.find((b) => b.thawed)).toMatchObject({ id: 'thaw-t1:freeze-f1:a:0', quantity: 1, thawed: '2026-11-20', useBy: '2026-11-22' });
  });

  it('ignores a freeze of a thawed batch, by name or not', () => {
    const byName = stockOf(chicken, bought, [...thawedOnce, e('freeze', 'thaw-t1:freeze-f1:a:0', 1, '2026-11-21', 'f2')], '2026-11-21');
    expect(byName.frozenQuantity).toBe(1);
    expect(byName.thawedQuantity).toBe(1);
    const anyBatch = stockOf(chicken, bought, [...thawedOnce, e('freeze', undefined, 5, '2026-11-21', 'f3')], '2026-11-21');
    expect(anyBatch.frozenQuantity).toBe(1); // nothing else outside the freezer, so nothing happens
    expect(anyBatch.thawedQuantity).toBe(1);
  });

  it('a product with thawed food is "use soon" until it is used, and past its date it needs a check', () => {
    expect(stockOf(chicken, bought, thawedOnce, '2026-11-20').status).toBe('use-soon');
    expect(stockOf(chicken, bought, thawedOnce, '2026-11-23').status).toBe('check');
    const used = [...thawedOnce, e('use', 'thaw-t1:freeze-f1:a:0', 1, '2026-11-21', 'u1')];
    const s = stockOf(chicken, bought, used, '2026-11-21');
    expect(s.thawedQuantity).toBe(0);
    expect(s.status).toBe('ok');
  });

  it('a count does not make thawed food fresh again', () => {
    const s = stockOf(chicken, bought, [...thawedOnce, e('count', undefined, 2, '2026-11-23', 'c1')], '2026-11-23');
    expect(s.batches.find((b) => b.thawed)).toMatchObject({ useBy: '2026-11-22' });
    expect(s.status).toBe('check');
  });
});

describe('weekly check, per batch', () => {
  const chicken = { type: 'fresh' as const, shelfLifeDays: 6 };
  const bought = [{ date: '2026-10-20', quantity: 0.5, batch: 'a:0' }, { date: '2026-11-01', quantity: 0.7, batch: 'b:0' }];
  const bev = (type: StockEvent['type'], batch: string | undefined, quantity: number, date: string, source: StockEvent['source'], id: string): StockEvent => ({
    id, productId: 'p', type, quantity, date, source, createdAt: `${date}T10:00:00Z`, updatedAt: '', ...(batch ? { batch } : {}),
  });

  it('asks about the old batch even though a newer one was bought since', () => {
    const s = stockOf(chicken, bought, [], '2026-11-02');
    expect(batchesToCheck('fresh', s, '2026-11-02').map((b) => b.id)).toEqual(['a:0']); // 13 days old; b:0 is 1 day old
    expect(needsCheck('fresh', s, '2026-11-02')).toBe(true);
  });

  it('a "still have" on one batch confirms just that batch', () => {
    const s = stockOf({ type: 'staple' as const }, [{ date: '2026-10-01', quantity: 2, batch: 'a:0' }, { date: '2026-10-02', quantity: 2, batch: 'b:0' }], [bev('count', 'a:0', 2, '2026-10-20', 'check', 'c1')], '2026-10-20');
    expect(s.batches.find((b) => b.id === 'a:0')?.confirmed).toBe('2026-10-20');
    expect(batchesToCheck('staple', s, '2026-10-20').map((b) => b.id)).toEqual(['b:0']); // both are 19 days old; only b:0 is still unconfirmed
  });

  it('confirming a batch that was past its date starts it again, but an undo does not', () => {
    const past = stockOf(chicken, bought.slice(0, 1), [], '2026-11-02');
    expect(past.status).toBe('check');
    const confirmed = stockOf(chicken, bought.slice(0, 1), [bev('count', 'a:0', 0.5, '2026-11-02', 'check', 'c1')], '2026-11-02');
    expect(confirmed.batches[0]).toMatchObject({ date: '2026-11-02', useBy: '2026-11-08', confirmed: '2026-11-02' });
    expect(confirmed.status).toBe('ok');
    expect(batchesToCheck('fresh', confirmed, '2026-11-02')).toEqual([]);
    // the same count from the app (what an undo writes) only sets the amount
    const undone = stockOf(chicken, bought.slice(0, 1), [bev('count', 'a:0', 0.5, '2026-11-02', 'app', 'c2')], '2026-11-02');
    expect(undone.batches[0]).toMatchObject({ date: '2026-10-20', useBy: '2026-10-26' });
    expect(undone.batches[0].confirmed).toBeUndefined();
  });

  it('finished or thrown out from the check takes just that batch off', () => {
    const s = stockOf(chicken, bought, [bev('count', 'a:0', 0, '2026-11-02', 'check', 'c1')], '2026-11-02');
    expect(s.batches.map((b) => b.id)).toEqual(['b:0']);
    expect(needsCheck('fresh', s, '2026-11-02')).toBe(false);
  });

  it('a count of the whole product confirms every batch', () => {
    const s = stockOf(chicken, bought, [bev('count', undefined, 1.2, '2026-11-02', 'app', 'c1')], '2026-11-02');
    expect(s.batches.every((b) => b.confirmed === '2026-11-02')).toBe(true);
  });

  it('the days since the last confirmation count, by type, and frozen or thawed food has its own rules', () => {
    const batch = (over: Partial<{ date: string; frozen: string; thawed: string; confirmed: string; useBy: string }>) => ({ date: '2026-10-01', quantity: 1, ...over });
    expect(needsBatchCheck('fresh', batch({ date: '2026-10-29' }), '2026-11-02')).toBe(true); // 4 days
    expect(needsBatchCheck('fresh', batch({ date: '2026-10-30' }), '2026-11-02')).toBe(false);
    expect(needsBatchCheck('fresh', batch({ date: '2026-10-01', confirmed: '2026-11-01' }), '2026-11-02')).toBe(false);
    expect(needsBatchCheck('snack', batch({}), '2026-12-01')).toBe(false);
    expect(needsBatchCheck('staple', batch({ frozen: '2026-10-20' }), '2026-11-20')).toBe(false); // frozen: months, not days
    expect(needsBatchCheck('staple', batch({ frozen: '2026-10-20' }), '2026-12-25')).toBe(true);
    expect(needsBatchCheck('fresh', batch({ date: '2026-10-01', thawed: '2026-11-01', useBy: '2026-11-03' }), '2026-11-02')).toBe(false);
    expect(needsBatchCheck('fresh', batch({ date: '2026-10-01', thawed: '2026-11-01', useBy: '2026-11-03' }), '2026-11-04')).toBe(true); // past its date
    expect(needsBatchCheck('fresh', { date: '2026-10-01', quantity: 0 }, '2026-11-02')).toBe(false);
  });
});

describe('used earlier (undated)', () => {
  it('takes the product out of stock but is not a use on any day', () => {
    const e = usedEarlierEvent('fp-chicken', undefined, 'app');
    expect(e.undated).toBe(true);
    expect(e.type).toBe('count');
    expect(e.quantity).toBe(0);
    expect(usesSince([{ ...e, type: 'use', quantity: 1 }])).toBe(0);
  });
});
