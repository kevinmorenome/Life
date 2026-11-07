import { describe, expect, it } from 'vitest';
import { depositSummary, monthlyFoodSpend, rebuyStats, savedByOffers, shoppingHabits, spendByCategory, spendByStore, wasteSummary, weekStart, weeklyFoodSpend } from './foodStats';
import { cheaperElsewhere, comparePrices, offerShare, priceHistory, regularUnitPrice, storePrices } from './prices';
import { groupByStore, shoppingList, usualInterval, usualQuantity } from './shopping';
import { productSummaries } from './products';
import { stockEntries } from './stockEntries';
import type { FoodProduct, FoodReceipt, ReceiptLine, StockEvent } from './types';

const line = (over: Partial<ReceiptLine>): ReceiptLine => {
  const l = { name: 'Milk', kind: 'food', quantity: 1, unit: 'pc', unitPrice: 1, discount: 0, paid: 0, ...over } as ReceiptLine;
  return { ...l, paid: over.paid ?? Math.round(l.quantity * l.unitPrice * 100) / 100 };
};
let n = 0;
const receipt = (over: Partial<FoodReceipt>): FoodReceipt => ({ id: `r${n++}`, store: 'Konzum', date: '2026-10-31', lines: [], createdAt: '', updatedAt: '', ...over });
const toss = (productId: string, quantity: number, date: string): StockEvent => ({ id: `e${n++}`, productId, type: 'toss', quantity, date, source: 'app', createdAt: date + 'T10:00:00Z', updatedAt: date });
const summary = (receipts: FoodReceipt[], products: FoodProduct[] = [], name = 'Milk') => productSummaries(receipts, products).find((p) => p.name === name)!;
const TODAY = '2026-11-02';

describe('prices', () => {
  it('works out the shelf price from a discounted line', () => {
    expect(regularUnitPrice({ unitPrice: 1.5, discount: 1, quantity: 2 })).toBe(2);
    expect(regularUnitPrice({ unitPrice: 1.5, quantity: 2 })).toBe(1.5);
  });

  const rs = [
    receipt({ store: 'Konzum', date: '2026-10-20', lines: [line({ unitPrice: 1.2 })] }),
    receipt({ store: 'Lidl', date: '2026-09-20', lines: [line({ unitPrice: 0.9 })] }),
    receipt({ store: 'Konzum', date: '2026-10-30', lines: [line({ unitPrice: 1.1, discount: 0.1 })] }),
  ];
  it('lists the last price at each store, cheapest shelf price first', () => {
    const prices = storePrices(summary(rs), TODAY);
    expect(prices.map((p) => [p.store, p.regular, p.paid, p.onOffer, p.purchases])).toEqual([
      ['Lidl', 0.9, 0.9, false, 1],
      ['Konzum', 1.2, 1.1, true, 2],
    ]);
    expect(prices[1].lowestRegular).toBe(1.2);
  });
  it('flags a clearly cheaper store, comparing shelf prices not offers', () => {
    const c = comparePrices(summary(rs), TODAY)!;
    expect(c.usual.store).toBe('Konzum');
    expect(c.cheaper?.store).toBe('Lidl');
    expect(c.saving).toBe(0.3);
    expect(Math.round(c.savingPct! * 100)).toBe(25);
  });
  it('does not flag small differences, a single store or stale prices', () => {
    const close = [receipt({ store: 'Konzum', date: '2026-10-30', lines: [line({ unitPrice: 1.0 })] }), receipt({ store: 'Lidl', date: '2026-10-01', lines: [line({ unitPrice: 0.98 })] })];
    expect(comparePrices(summary(close), TODAY)?.cheaper).toBeUndefined();
    expect(comparePrices(summary([rs[0]]), TODAY)?.cheaper).toBeUndefined();
    const stale = [rs[0], receipt({ store: 'Lidl', date: '2025-01-01', lines: [line({ unitPrice: 0.5 })] })];
    expect(comparePrices(summary(stale), TODAY)?.prices.map((p) => p.store)).toEqual(['Konzum']);
  });
  it('compares per kg, and per item for multipacks', () => {
    const beer = (store: string, price: number) => receipt({ store, date: '2026-10-25', lines: [line({ name: 'Beer', kind: 'alcohol', unitPrice: price })] });
    const rec: FoodProduct = { id: 'fp-beer', name: 'Beer', type: 'drink', storage: 'pantry', packSize: 6, packLabel: 'can', createdAt: '', updatedAt: '' };
    const p = summary([beer('Konzum', 6), beer('Lidl', 4.5)], [rec], 'Beer');
    expect(storePrices(p, TODAY).map((s) => [s.store, s.regular])).toEqual([['Lidl', 0.75], ['Konzum', 1]]);
  });
  it('ranks products by yearly saving and builds a history', () => {
    const list = cheaperElsewhere(productSummaries(rs, []), TODAY);
    expect(list).toHaveLength(1);
    expect(list[0].perUnit).toBe(0.3);
    expect(list[0].yearly).toBe(0.9); // 3 bought in the last year × 0.30
    expect(priceHistory(summary(rs)).map((h) => h.date)).toEqual(['2026-09-20', '2026-10-20', '2026-10-30']);
    expect(offerShare(summary(rs))).toEqual({ offers: 1, of: 3, saved: 0.1 });
  });
});

describe('shopping list', () => {
  it('finds the usual rhythm from the middle gap between purchase days', () => {
    expect(usualInterval(['2026-10-01', '2026-10-08'])).toBeUndefined();
    expect(usualInterval(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-15', '2026-10-29'])).toBe(7);
  });
  it('takes the usual quantity', () => {
    expect(usualQuantity([2, 2, 1], 'pc')).toBe(2);
    expect(usualQuantity([0.52, 0.61, 0.48], 'kg')).toBe(0.5);
    expect(usualQuantity([], 'pc')).toBe(1);
  });

  const buy = (date: string, over: Partial<ReceiptLine> = {}, store = 'Konzum') => receipt({ store, date, lines: [line(over)] });
  const list = (rs: FoodReceipt[], events: StockEvent[] = [], products: FoodProduct[] = []) => shoppingList(stockEntries(rs, products, events, TODAY), TODAY);

  it('lists what is out, with the cheapest store', () => {
    const rs = [buy('2026-10-25', { name: 'Rice', unitPrice: 2 }), buy('2026-10-20', { name: 'Rice', unitPrice: 1.5 }, 'Lidl')];
    const count0: StockEvent = { id: 'c', productId: 'fp-rice', type: 'count', quantity: 0, date: '2026-10-30', source: 'app', createdAt: '2026-10-30T10:00:00Z', updatedAt: '' };
    const items = list(rs, [count0]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Rice', reason: 'out', store: 'Lidl', saving: 0.5, quantity: 1, cost: 1.5 }); // last bought at Konzum, Lidl is 0.50 cheaper;
  });
  it('lists staples running low and ignores what is in stock and not yet due', () => {
    const rs = [buy('2026-10-30', { name: 'Pasta', quantity: 1 }), buy('2026-10-30', { name: 'Flour', quantity: 3 })];
    const items = list(rs);
    expect(items.map((i) => [i.name, i.reason])).toEqual([['Pasta', 'low']]);
  });
  it('lists what you usually rebuy by now, unless the habit lapsed or it is fresh and in stock', () => {
    const weekly = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13', '2026-10-20'];
    const rs = weekly.map((d) => buy(d, { name: 'Coffee', quantity: 3, unitPrice: 4 }));
    expect(list(rs).map((i) => [i.name, i.reason, i.everyDays])).toEqual([['Coffee', 'due', 7]]);
    const lapsed = weekly.slice(0, 3).map((d) => buy(d, { name: 'Coffee', quantity: 3 }));
    expect(list(lapsed).filter((i) => i.reason === 'due')).toEqual([]);
  });
  it('does not list a one-off product bought long ago, or an out snack', () => {
    const old = buy('2025-01-01', { name: 'Marzipan' });
    expect(list([old])).toEqual([]);
    const snack: FoodProduct = { id: 'fp-chips', name: 'Chips', type: 'snack', storage: 'pantry', createdAt: '', updatedAt: '' };
    expect(list([buy('2026-10-20', { name: 'Chips' })], [], [snack])).toEqual([]);
  });
  it('groups by cheapest store with a cost estimate, items without a price last', () => {
    const groups = groupByStore([
      { productId: 'a', name: 'A', reason: 'out', quantity: 2, unit: 'pc', daysSince: 3, per: ' each', store: 'Lidl', cost: 3 },
      { productId: 'b', name: 'B', reason: 'low', quantity: 1, unit: 'pc', daysSince: 3, per: ' each', store: 'lidl', cost: 1.5 },
      { productId: 'c', name: 'C', reason: 'due', quantity: 1, unit: 'pc', daysSince: 3, per: ' each' },
      { productId: 'd', name: 'D', reason: 'due', quantity: 1, unit: 'pc', daysSince: 3, per: ' each', store: 'Konzum', cost: 2 },
    ]);
    expect(groups.map((g) => [g.store, g.items.length, g.estimate])).toEqual([['Lidl', 2, 4.5], ['Konzum', 1, 2], [undefined, 1, 0]]);
  });
});

describe('waste by batch', () => {
  it('values a thrown-away batch at what that batch cost', () => {
    const rs = [receipt({ id: 'a', date: '2026-10-01', lines: [line({ name: 'Chicken', unit: 'kg', quantity: 1, unitPrice: 6 })] }), receipt({ id: 'b', date: '2026-10-10', lines: [line({ name: 'Chicken', unit: 'kg', quantity: 1, unitPrice: 10 })] })];
    const products = productSummaries(rs, []);
    const batchToss = { ...toss('fp-chicken', 0.5, '2026-10-12'), batch: 'b:0' };
    expect(wasteSummary(products, [batchToss], rs, '2026-11', 1).value).toBe(5); // 0.5 kg × 10, not the 8 average
    expect(wasteSummary(products, [toss('fp-chicken', 0.5, '2026-10-12')], rs, '2026-11', 1).value).toBe(4);
  });
});

describe('waste kept out of the statistics', () => {
  it('leaves out food thrown away that you marked as not counted', () => {
    const rs = [receipt({ date: '2026-10-01', lines: [line({ name: 'Chicken', unit: 'kg', quantity: 1, unitPrice: 6 })] })];
    const products = productSummaries(rs, []);
    const kept = { ...toss('fp-chicken', 0.5, '2026-10-12'), untracked: true };
    expect(wasteSummary(products, [kept], rs, '2026-11', 1)).toMatchObject({ value: 0, times: 0 });
    expect(wasteSummary(products, [kept, toss('fp-chicken', 0.5, '2026-10-13')], rs, '2026-11', 1)).toMatchObject({ value: 3, times: 1 });
  });
});

describe('food stats', () => {
  const rs = [
    receipt({ store: 'Konzum', date: '2026-10-26', lines: [line({ name: 'Milk', unitPrice: 1, discount: 0.2 }), line({ name: 'Beer', kind: 'alcohol', unitPrice: 2 }), line({ name: 'Deposit', kind: 'deposit', unitPrice: 0.5 }), line({ name: 'Bag', kind: 'bag', unitPrice: 0.1 })] }),
    receipt({ store: ' konzum', date: '2026-10-05', lines: [line({ name: 'Milk', unitPrice: 1 })] }),
    receipt({ store: 'Lidl', date: '2026-09-30', lines: [line({ name: 'Apples', unit: 'kg', quantity: 1.5, unitPrice: 2 })] }),
  ];
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
  });
  it('totals food per month and week, leaving deposits and bags out and filling empty periods', () => {
    const months = monthlyFoodSpend(rs, '2026-11', 3);
    expect(months).toEqual([{ key: '2026-09', spent: 3, trips: 1 }, { key: '2026-10', spent: 4, trips: 2 }, { key: '2026-11', spent: 0, trips: 0 }]);
    const weeks = weeklyFoodSpend(rs, TODAY, 2);
    expect(weeks).toEqual([{ key: '2026-10-26', spent: 3, trips: 1 }, { key: '2026-11-02', spent: 0, trips: 0 }]);
  });
  it('splits spend by store and by category', () => {
    expect(spendByStore(rs).map((s) => [s.store, s.spent, s.trips, s.average])).toEqual([['Konzum', 4, 2, 2], ['Lidl', 3, 1, 3]]);
    const cats = spendByCategory(rs, [{ id: 'fp-milk', name: 'Milk', type: 'fresh', storage: 'fridge', createdAt: '', updatedAt: '' }]);
    expect(cats.map((c) => [c.key, c.spent])).toEqual([['fresh', 5], ['alcohol', 2]]); // milk 1 + 1 and apples 3; deposits and bags are not food
  });
  it('sums discounts, deposits and shopping habits', () => {
    expect(savedByOffers(rs)).toEqual({ saved: 0.2, offerLines: 1, lines: 4 });
    expect(depositSummary(rs)).toEqual({ paid: 0.5, lines: 1 });
    expect(shoppingHabits(rs)).toMatchObject({ trips: 3, perWeek: 0.8, since: '2026-09-30' });
    expect(shoppingHabits([])).toEqual({ trips: 0, basket: 0, perWeek: 0 });
  });
  it('values thrown-away food at the average price and counts rebuys', () => {
    const products = productSummaries(rs, []);
    const w = wasteSummary(products, [toss('fp-milk', 1, '2026-10-28'), toss('fp-apples', 0.5, '2026-10-29'), { ...toss('fp-milk', 2, '2026-10-28'), type: 'use' }], rs, '2026-11', 2);
    expect(w.value).toBe(2); // 1 × 1.00 milk + 0.5 × 2.00 apples
    expect(w.times).toBe(2);
    expect(w.perMonth).toEqual([{ key: '2026-10', value: 2 }, { key: '2026-11', value: 0 }]);
    expect(w.top.map((t) => t.name)).toEqual(['Apples', 'Milk']); // both 1.00: ties by name
    expect(w.share).toBeCloseTo(2 / 7, 5);
    expect(rebuyStats(products)).toMatchObject([{ name: 'Milk', purchases: 2, spent: 2 }]);
  });
});
