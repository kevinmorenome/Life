import { describe, expect, it } from 'vitest';
import { activityOf, batchBadges, batchNumber, batchTitle, dueText, expiryBadge, originalQuantity, overviewOf, parseAmount, pastStatus, usedOf } from './batchView';
import type { ProductSummary, Purchase } from './products';
import { effectiveEvents, stockOf } from './stock';
import type { StockEvent } from './types';

const buy = (batch: string, date: string, quantity: number, store = 'Konzum'): Purchase => ({ receiptId: batch.split(':')[0], date, store, quantity, unit: 'kg', unitPrice: 8, paid: quantity * 8, batch });
// Newest first, like `productSummaries()` gives them.
const purchases = [buy('c:0', '2026-11-08', 0.7), buy('b:0', '2026-11-06', 0.8, 'Lidl'), buy('a:0', '2026-10-31', 1), buy('z:0', '2026-10-20', 0.5)];
const product = { type: 'fresh', storage: 'fridge', purchases } as unknown as ProductSummary;
const ev = (id: string, type: StockEvent['type'], quantity: number, date: string, extra: Partial<StockEvent> = {}): StockEvent => ({ id, productId: 'p', type, quantity, date, source: 'app', createdAt: `${date}T10:00:0${id.length}.000Z`, updatedAt: date, ...extra });
const events = [
  ev('e0', 'count', 0, '2026-10-24', { batch: 'z:0' }),
  ev('e1', 'use', 0.4, '2026-11-01', { batch: 'a:0' }),
  ev('e2', 'freeze', 0.6, '2026-11-01', { batch: 'a:0', createdAt: '2026-11-01T11:00:00.000Z' }),
  ev('e3', 'use', 0.3, '2026-11-07', { batch: 'b:0', source: 'claude' }),
];
const today = '2026-11-09';
const stock = stockOf(product, purchases, events, today);
const amount = (q: number) => `${q} kg`;
const day = (iso: string) => iso;
const byId = (id: string) => stock.batches.find((b) => b.id === id)!;

describe('batches of a product', () => {
  it('numbers batches by the order they were bought, and follows frozen parts back to their purchase', () => {
    expect(purchases.map((p) => batchNumber(product, { id: p.batch }))).toEqual([4, 3, 2, 1]);
    expect(batchTitle(product, { id: 'freeze-e2:a:0' })).toBe('Batch #2');
    expect(batchTitle(product, { id: 'count-x' })).toBe('Counted stock');
  });

  it('keeps every purchase as its own batch', () => {
    expect(stock.batches.map((b) => [b.id, b.quantity]).sort()).toEqual([['b:0', 0.5], ['c:0', 0.7], ['freeze-e2:a:0', 0.6]]);
    expect(stock.pastBatches.map((b) => b.id).sort()).toEqual(['a:0', 'z:0']);
  });

  it('knows how much a batch started with and how much is used: what went to the freezer is not used', () => {
    expect(originalQuantity(stock.history['b:0'])).toBe(0.8);
    expect(usedOf(byId('b:0'), stock.history['b:0'])).toBe(0.3);
    expect(usedOf({ quantity: 0 }, stock.history['a:0'])).toBe(0.4);
    expect(usedOf(byId('freeze-e2:a:0'), stock.history['freeze-e2:a:0'])).toBe(0);
  });

  it('gives one badge of each kind: freshness, place, use', () => {
    const texts = (id: string) => batchBadges(product, byId(id), stock.history[id], today).map((b) => `${b.kind}:${b.text}:${b.tone}`);
    expect(texts('c:0')).toEqual(['expiry:Fresh:green', 'storage:Fridge:grey', 'usage:Unopened:grey']);
    expect(texts('b:0')).toEqual(['expiry:Expiring soon:orange', 'storage:Fridge:grey', 'usage:Partially used:grey']);
    expect(texts('freeze-e2:a:0')).toEqual(['storage:Frozen:blue']);
  });

  it('tells fresh from soon from past, and leaves what has no date alone', () => {
    expect(expiryBadge({ useBy: '2026-11-08' }, today)?.text).toBe('Past date');
    expect(expiryBadge({ useBy: '2026-11-09' }, today)?.text).toBe('Expiring soon');
    expect(expiryBadge({ useBy: '2026-11-12' }, today)?.text).toBe('Expiring soon');
    expect(expiryBadge({ useBy: '2026-11-13' }, today)?.text).toBe('Fresh');
    expect(expiryBadge({}, today)).toBeUndefined();
    expect(expiryBadge({ useBy: '2027-01-30', frozen: '2026-11-01' }, today)).toBeUndefined();
  });

  it('adds the overview up from the batches, with more than one place when they differ', () => {
    const o = overviewOf(product, stock, today);
    expect(o).toMatchObject({ active: 3, soon: 1, past: 0, places: ['Freezer', 'Fridge'] });
    expect(o.badges.map((b) => b.text)).toEqual(['Expiring soon', 'Fresh', 'Frozen', 'Partially used']);
    const gone = stockOf(product, [purchases[3]], [events[0]], today);
    expect(overviewOf(product, gone, today)).toMatchObject({ active: 0, badges: [{ text: 'Used up' }] });
  });

  it('says how a batch that is gone ended', () => {
    expect(pastStatus(stock.history['z:0'])).toMatchObject({ text: 'Finished', tone: 'green', date: '2026-10-24' });
    expect(pastStatus(stock.history['a:0'])).toMatchObject({ text: 'Moved to freezer', tone: 'blue' });
    const tossed = stockOf(product, [purchases[0]], [ev('t', 'toss', 0.7, '2026-11-09', { batch: 'c:0' })], today);
    expect(pastStatus(tossed.history['c:0'])).toMatchObject({ text: 'Discarded', tone: 'red' });
    const earlier = stockOf(product, [purchases[0]], [ev('u', 'count', 0, '2026-11-09', { batch: 'c:0', undated: true })], today);
    expect(pastStatus(earlier.history['c:0'])).toMatchObject({ text: 'Used earlier', undated: true });
  });

  it('lists everything that happened, newest first, with freezing as one line and gone batches kept', () => {
    const lines = activityOf(product, stock, amount, day).map((a) => `${a.date} ${a.text} [${[a.batch, ...a.notes].join(', ')}]`);
    expect(lines).toEqual([
      '2026-11-08 Purchased 0.7 kg [Batch #4, Konzum]',
      '2026-11-07 Used 0.3 kg [Batch #3, via Claude]',
      '2026-11-06 Purchased 0.8 kg [Batch #3, Lidl]',
      '2026-11-01 Put 0.6 kg in the freezer [Batch #2]',
      '2026-11-01 Used 0.4 kg [Batch #2]',
      '2026-10-31 Purchased 1 kg [Batch #2, Konzum]',
      '2026-10-24 Finished the last 0.5 kg [Batch #1]',
      '2026-10-20 Purchased 0.5 kg [Batch #1, Konzum]',
    ]);
  });

  it('thawing with a use-by of your own sets it on the thawed batch only', () => {
    const thaw = ev('th', 'thaw', 0.2, '2026-11-09', { batch: 'freeze-e2:a:0', createdAt: '2026-11-09T09:00:00.000Z' });
    const by = ev('x', 'expiry', 0, '2026-11-09', { batch: 'thaw-th:freeze-e2:a:0', useBy: '2026-11-10', createdAt: '2026-11-09T09:00:00.001Z' });
    const s = stockOf(product, purchases, [...events, thaw, by], today);
    const thawed = s.batches.find((b) => b.thawed)!;
    expect(thawed).toMatchObject({ quantity: 0.2, useBy: '2026-11-10', thawed: '2026-11-09' });
    expect(s.batches.find((b) => b.id === 'freeze-e2:a:0')).toMatchObject({ quantity: 0.4, frozen: '2026-11-01' });
    expect(batchBadges(product, thawed, s.history[thawed.id!], today).map((b) => b.text)).toEqual(['Expiring soon', 'Thawed']);
  });

  it('reads typed amounts, never above what there is and never below zero', () => {
    expect(parseAmount('0,3')).toBe(0.3);
    expect(parseAmount(' 1.5 ', 1)).toBe(1);
    expect(parseAmount('0')).toBeUndefined();
    expect(parseAmount('0', undefined, true)).toBe(0);
    expect(parseAmount('-1')).toBeUndefined();
    expect(parseAmount('abc')).toBeUndefined();
    expect(parseAmount('')).toBeUndefined();
  });

  it('says how far a date is in words', () => {
    expect([0, 1, -1, 4, -3].map(dueText)).toEqual(['today', 'tomorrow', 'yesterday', 'in 4 days', '3 days ago']);
  });

  describe('corrections', () => {
    const edit = (id: string, target: string, change: { newDate?: string; removed?: boolean; undated?: boolean }, at = '2026-11-09T20:00:00.000Z'): StockEvent => ({ ...ev(id, 'edit', 0, '2026-11-09', { target, ...change }), createdAt: at });

    it('removing an event gives the batch its amount back, and the event counts for nothing', () => {
      const s = stockOf(product, purchases, [...events, edit('x1', 'e0', { removed: true })], today);
      expect(s.pastBatches.map((b) => b.id)).toEqual(['a:0']);
      expect(s.batches.find((b) => b.id === 'z:0')).toMatchObject({ quantity: 0.5 });
      expect(s.history['z:0'].map((h) => h.kind)).toEqual(['bought']);
    });

    it('moves an event to another day, and gives a date to one that had none', () => {
      const s = stockOf(product, purchases, [...events, edit('x1', 'e3', { newDate: '2026-11-08' })], today);
      expect(s.history['b:0'][1]).toMatchObject({ kind: 'used', date: '2026-11-08', edited: true, eventId: 'e3' });
      const undated = ev('u', 'count', 0, '2026-11-09', { batch: 'c:0', undated: true });
      const dated = stockOf(product, purchases, [...events, undated, edit('x2', 'u', { newDate: '2026-11-08' })], today);
      expect(pastStatus(dated.history['c:0'])).toMatchObject({ text: 'Finished', date: '2026-11-08' });
      expect(pastStatus(dated.history['c:0']).undated).toBeUndefined();
    });

    it('can say nobody knows when something was used: it then counts as a use on no day', () => {
      const s = stockOf(product, purchases, [...events, edit('x1', 'e3', { undated: true })], today);
      expect(s.history['b:0'][1]).toMatchObject({ kind: 'used', undated: true, quantity: 0.3 });
      expect(s.batches.find((b) => b.id === 'b:0')).toMatchObject({ quantity: 0.5 });
      const use = ev('u1', 'use', 1, '2026-11-09');
      expect(effectiveEvents([use, edit('x1', 'u1', { undated: true })])[0]).toMatchObject({ undated: true });
    });

    it('the newest correction wins, so one with nothing in it puts the event back as it was', () => {
      const all = [...events, edit('x1', 'e3', { removed: true }), edit('x2', 'e3', {}, '2026-11-09T20:00:01.000Z')];
      expect(effectiveEvents(all)).toEqual(events);
      expect(effectiveEvents(events)).toBe(events);
    });

    it('is never read as an event of its own', () => {
      const use = ev('u1', 'use', 1, '2026-11-09');
      expect(effectiveEvents([use, edit('x1', 'u1', { removed: true })])).toEqual([]);
      expect(effectiveEvents([use, edit('x1', 'gone', { removed: true })])).toEqual([use]);
    });
  });

  it('a freeze or a finish on an earlier day counts from that day', () => {
    const freeze = ev('f9', 'freeze', 0.2, '2026-11-07', { batch: 'b:0', createdAt: '2026-11-09T21:00:00.000Z' });
    const done = ev('d9', 'count', 0, '2026-11-08', { batch: 'c:0', createdAt: '2026-11-09T21:00:01.000Z' });
    const s = stockOf(product, purchases, [...events, freeze, done], today);
    expect(s.batches.find((b) => b.id === 'freeze-f9:b:0')).toMatchObject({ quantity: 0.2, frozen: '2026-11-07', useBy: '2027-02-05' });
    expect(s.pastBatches.map((b) => b.id)).toContain('c:0');
    expect(pastStatus(s.history['c:0'])).toMatchObject({ text: 'Finished', date: '2026-11-08' });
  });
});
