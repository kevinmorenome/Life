import { describe, expect, it } from 'vitest';
import type { ProductSummary } from './products';
import { stockOf } from './stock';
import type { Entry } from './stockEntries';
import type { StockEvent } from './types';
import { findDate, parseUsage } from './usageParse';
import { batchesOldestFirst, planLine } from './usagePlan';

// 2026-11-11 is a Wednesday.
const TODAY = '2026-11-11';

type Buy = [date: string, quantity: number];
function entry(id: string, name: string, buys: Buy[], over: Partial<ProductSummary> = {}, events: StockEvent[] = []): Entry {
  const product: ProductSummary = {
    id, name, kind: 'food', unit: 'pc', type: 'staple', storage: 'pantry', hasPhoto: false, custom: false,
    purchases: buys.map(([date, quantity], i) => ({ batch: `${id}:${i}`, receiptId: id, date, store: 'K', quantity, unit: 'pc', unitPrice: 1, paid: quantity })),
    ...over,
  };
  return { product, stock: stockOf(product, product.purchases, events, TODAY) };
}
const pesto = (events: StockEvent[] = []) => entry('fp-pesto', 'Pesto sauce 190g', [['2026-11-08', 2]], {}, events);
const chicken = () => entry('fp-chicken', 'Chicken breast', [['2026-11-02', 1], ['2026-11-09', 2]], { type: 'fresh', storage: 'fridge' });
const stock = [pesto(), chicken(), entry('fp-oat', 'Oat drink', [['2026-11-01', 3]]), entry('fp-oat-choc', 'Oat drink chocolate', [['2026-11-01', 1]])];

describe('findDate', () => {
  it('knows today, yesterday and "n days ago"', () => {
    expect(findDate('today I used it', TODAY)?.date).toBe(TODAY);
    expect(findDate('yesterday', TODAY)?.date).toBe('2026-11-10');
    expect(findDate('three days ago', TODAY)?.date).toBe('2026-11-08');
    expect(findDate('a week ago', TODAY)?.date).toBe('2026-11-04');
  });
  it('takes the most recent matching weekday that already happened', () => {
    expect(findDate('on Tuesday', TODAY)?.date).toBe('2026-11-10');
    expect(findDate('on friday', TODAY)?.date).toBe('2026-11-06');
    // Today is a Wednesday: only "today" means today.
    expect(findDate('on Wednesday', TODAY)?.date).toBe('2026-11-04');
    expect(findDate('last wednesday', TODAY)?.date).toBe('2026-11-04');
  });
  it('reads a day and month, in the past', () => {
    expect(findDate('on 5 November', TODAY)?.date).toBe('2026-11-05');
    expect(findDate('nov 20', TODAY)?.date).toBe('2025-11-20');
    expect(findDate('2026-11-03', TODAY)?.date).toBe('2026-11-03');
  });
  it('flags vague dates instead of guessing', () => {
    expect(findDate('last week', TODAY)).toMatchObject({ vague: true });
    expect(findDate('a few days ago', TODAY)).toMatchObject({ vague: true });
    expect(findDate('used the pesto', TODAY)).toBeUndefined();
  });
});

describe('parseUsage', () => {
  it('reads "used half of the pesto" as a use of half', () => {
    const [l] = parseUsage('today I used half of the pesto', stock, TODAY);
    expect(l).toMatchObject({ action: 'use', candidates: ['fp-pesto'], date: TODAY, amount: { kind: 'fraction', value: 0.5 }, notInStats: false });
    expect(l.question).toBeUndefined();
  });
  it('splits a whole day into one line per product', () => {
    const lines = parseUsage('Today I used half of the pesto, and I used one chicken breast', stock, TODAY);
    expect(lines.map((l) => [l.candidates, l.action, l.amount, l.date])).toEqual([
      [['fp-pesto'], 'use', { kind: 'fraction', value: 0.5, text: 'half' }, TODAY],
      [['fp-chicken'], 'use', { kind: 'count', value: 1 }, TODAY],
    ]);
  });
  it('a date said once applies to the clauses that have none', () => {
    const lines = parseUsage('on Tuesday I used half the pesto and one chicken breast', stock, TODAY);
    expect(lines.map((l) => l.date)).toEqual(['2026-11-10', '2026-11-10']);
  });
  it('understands freezing, throwing out, finishing and thawing', () => {
    const act = (s: string) => parseUsage(s, stock, TODAY)[0]?.action;
    expect(act('I froze the chicken on Wednesday')).toBe('freeze');
    expect(act('threw out the pesto')).toBe('toss');
    expect(act('finished the pesto')).toBe('finish');
    expect(act('used it all, the chicken')).toBe('finish');
  });
  it('backdates "I froze the chicken three days ago"', () => {
    const [l] = parseUsage('I froze the chicken three days ago', stock, TODAY);
    expect(l).toMatchObject({ action: 'freeze', date: '2026-11-08', candidates: ['fp-chicken'] });
    expect(l.amount).toBeUndefined();
  });
  it('a pack that is half left is "some left", not a use of half', () => {
    const [l] = parseUsage('about half of the pesto is left', stock, TODAY);
    expect(l).toMatchObject({ action: 'some_left', amount: { kind: 'fraction', value: 0.5 } });
  });
  it('asks instead of guessing a vague amount or date', () => {
    expect(parseUsage('used some pesto', stock, TODAY)[0].question).toMatch(/How much/);
    expect(parseUsage('used half the pesto last week', stock, TODAY)[0].question).toMatch(/Which day/);
  });
  it('lists the candidates when a name fits several, and prefers an exact name', () => {
    expect(parseUsage('used one oat', stock, TODAY)[0].candidates.sort()).toEqual(['fp-oat', 'fp-oat-choc']);
    expect(parseUsage('used one oat drink', stock, TODAY)[0].candidates.sort()).toEqual(['fp-oat', 'fp-oat-choc']);
    expect(parseUsage('used one oat drink chocolate', stock, TODAY)[0].candidates).toEqual(['fp-oat-choc']);
  });
  it('says so when nothing fits', () => {
    expect(parseUsage('used the caviar', stock, TODAY)[0]).toMatchObject({ candidates: [], unknownProduct: expect.stringMatching(/caviar/) });
  });
  it('keeps it out of the statistics only when asked', () => {
    expect(parseUsage('I already used the pesto earlier, just catching up', stock, TODAY)[0]).toMatchObject({ notInStats: true, date: TODAY, question: undefined });
    expect(parseUsage('used the pesto yesterday', stock, TODAY)[0].notInStats).toBe(false);
  });
  it('reads "one and a half"', () => {
    expect(parseUsage('used one and a half chicken breast', stock, TODAY)[0].amount).toEqual({ kind: 'count', value: 1.5 });
    expect(parseUsage('used 0.5 chicken breast', stock, TODAY)[0].amount).toEqual({ kind: 'count', value: 0.5 });
  });
});

describe('planLine', () => {
  const line = (s: string, es = stock) => parseUsage(s, es, TODAY)[0];

  it('logs half a jar as one use event of 0.5, dated today, off the pesto batch', () => {
    const e = pesto();
    const plan = planLine(line('today I used half of the pesto'), e, [], TODAY);
    expect(plan.question).toBeUndefined();
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].event).toMatchObject({ productId: 'fp-pesto', type: 'use', quantity: 0.5, date: TODAY, source: 'app', batch: 'fp-pesto:0' });
    expect(plan.steps[0].event.untracked).toBeUndefined();
  });

  it('takes from the oldest purchase, even when a newer batch expires first', () => {
    const e = chicken();
    // The newer batch gets an earlier use-by by hand; the oldest purchase is still used first.
    const withExpiry = entry('fp-chicken', 'Chicken breast', [['2026-11-02', 1], ['2026-11-09', 2]], { type: 'fresh', storage: 'fridge' }, [
      { id: 'x', productId: 'fp-chicken', type: 'expiry', quantity: 0, date: '2026-11-09', source: 'app', batch: 'fp-chicken:1', useBy: '2026-11-10', createdAt: '2026-11-09T10:00:00Z', updatedAt: '' },
    ]);
    expect(batchesOldestFirst(withExpiry).map((b) => b.id)).toEqual(['fp-chicken:0', 'fp-chicken:1']);
    const plan = planLine(line('I used one chicken breast', [e]), e, [], TODAY);
    expect(plan.steps.map((s) => [s.event.batch, s.event.quantity])).toEqual([['fp-chicken:0', 1]]);
  });

  it('spills into the next batch when the oldest is not enough', () => {
    const e = chicken();
    const plan = planLine(line('I used two chicken breast', [e]), e, [], TODAY);
    expect(plan.steps.map((s) => [s.event.batch, s.event.quantity])).toEqual([['fp-chicken:0', 1], ['fp-chicken:1', 1]]);
  });

  it('refuses more than there is', () => {
    const e = pesto();
    expect(planLine(line('used five pesto'), e, [], TODAY).question).toMatch(/Only 2/);
  });

  it('freezes the whole oldest batch when no amount is said, or the amount when it is', () => {
    const e = chicken();
    expect(planLine(line('I froze the chicken', [e]), e, [], TODAY).steps.map((s) => [s.event.type, s.event.batch, s.event.quantity])).toEqual([['freeze', 'fp-chicken:0', 1]]);
    expect(planLine(line('I froze two chicken breast', [e]), e, [], TODAY).steps.map((s) => [s.event.batch, s.event.quantity])).toEqual([['fp-chicken:0', 1], ['fp-chicken:1', 1]]);
  });

  it('a backdated freeze is stored on that day', () => {
    const e = chicken();
    const plan = planLine(line('I froze the chicken three days ago', [e]), e, [], TODAY);
    expect(plan.steps[0].event).toMatchObject({ type: 'freeze', date: '2026-11-08' });
  });

  it('never refreezes thawed food', () => {
    const base = entry('fp-chicken', 'Chicken breast', [['2026-11-02', 2]], { type: 'fresh', storage: 'fridge' });
    const frozen: StockEvent = { id: 'f', productId: 'fp-chicken', type: 'freeze', quantity: 2, date: '2026-11-03', source: 'app', batch: 'fp-chicken:0', createdAt: '2026-11-03T10:00:00Z', updatedAt: '' };
    const thaw: StockEvent = { id: 't', productId: 'fp-chicken', type: 'thaw', quantity: 2, date: '2026-11-09', source: 'app', batch: 'freeze-f:fp-chicken:0', createdAt: '2026-11-09T10:00:00Z', updatedAt: '' };
    const e = entry('fp-chicken', 'Chicken breast', [['2026-11-02', 2]], { type: 'fresh', storage: 'fridge' }, [frozen, thaw]);
    expect(base.stock.quantity).toBe(2);
    const plan = planLine(parseUsage('I froze the chicken', [e], TODAY)[0], e, [frozen, thaw], TODAY);
    expect(plan.question).toMatch(/never frozen again/);
    expect(plan.steps).toEqual([]);
  });

  it('marks events untracked only when the user said it should not count', () => {
    const e = pesto();
    expect(planLine(line('I already used half the pesto, just catching up'), e, [], TODAY).steps[0].event.untracked).toBe(true);
  });

  it('warns when a later count already covers a backdated event', () => {
    const e = pesto();
    const count: StockEvent = { id: 'c', productId: 'fp-pesto', type: 'count', quantity: 2, date: '2026-11-10', source: 'app', createdAt: '2026-11-10T10:00:00Z', updatedAt: '' };
    const plan = planLine(line('on Monday I used half the pesto'), e, [count], TODAY);
    expect(plan.warnings.join(' ')).toMatch(/already covers it/);
  });

  it('weighed products need a weight, not "half"', () => {
    const meat = entry('fp-mince', 'Minced meat', [['2026-11-09', 0.5]], { unit: 'kg', type: 'fresh' });
    expect(planLine(parseUsage('used half the minced meat', [meat], TODAY)[0], meat, [], TODAY).question).toMatch(/Half of how much/);
    const ok = planLine(parseUsage('used 200 g of the minced meat', [meat], TODAY)[0], meat, [], TODAY);
    expect(ok.steps[0].event).toMatchObject({ type: 'use', quantity: 0.2, batch: 'fp-mince:0' });
  });

  it('"some left" lowers the open pack by the difference (2 jars, half of one left = 1½), with no batch', () => {
    const e = pesto();
    const plan = planLine(line('about half of the pesto is left'), e, [], TODAY);
    expect(plan.steps[0].event).toMatchObject({ type: 'use', quantity: 0.5 });
    expect(plan.steps[0].event.batch).toBeUndefined();
  });
});
