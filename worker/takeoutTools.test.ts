import { describe, expect, it } from 'vitest';
import type { ToolContext } from './mcpTools';
import { callTool } from './mcpTools';
import type { RecordStore, Row } from './records';

function setup(seed: Record<string, Row[]> = {}) {
  const data: Record<string, Map<string, Row>> = {};
  const m = (s: string) => (data[s] ??= new Map());
  for (const [s, rows] of Object.entries(seed)) for (const r of rows) m(s).set(r.id, r);
  const store: RecordStore = { list: async (s) => [...m(s).values()], put: async (s, id, r) => void m(s).set(id, { id, ...r }), photos: async () => new Map() };
  let n = 0;
  const ctx: ToolContext = { store, readOnly: false, now: new Date('2026-11-18T12:00:00Z'), newId: () => `n${++n}`, appUrl: 'x' };
  return { data, m, ctx };
}
const call = async (ctx: ToolContext, name: string, args: Record<string, unknown>) => {
  const r = await callTool(name, args, ctx);
  return { error: r.isError, json: () => JSON.parse(r.text), text: r.text };
};
const ORDER: Row = { id: 'wolt-abc', restaurant: 'Tian Tan', date: '2026-11-15', time: '14:21', total: 30.17, currency: 'EUR' };
const ITEMS = [
  { name: 'Juha od povrća', qty: 1, unitPrice: 2.9, linePrice: 2.9, vat: 13 },
  { name: 'Pohana piletina u slatko - kiselom umaku', qty: 2, unitPrice: 11, linePrice: 22, vat: 13 },
  { name: 'Kiselo - ljuta juha s piletinom', qty: 1, unitPrice: 3.3, linePrice: 3.3, vat: 13 },
];

describe('attach_takeout_items', () => {
  it('attaches once, recomputes the subtotal and never duplicates', async () => {
    const { ctx, m } = setup({ woltorders: [ORDER] });
    const args = { orders: [{ sourceId: 'abc', items: ITEMS, feesTotal: 1.97, invoiceNo: '60298/1/23', paymentMethod: 'Revolut Pay' }] };
    expect((await call(ctx, 'attach_takeout_items', args)).json()).toMatchObject({ attached: 1, alreadyAttached: 0 });
    expect(m('takeoutdetails').get('td-wolt-abc')).toMatchObject({ orderId: 'wolt-abc', itemsSubtotal: 28.2, feesTotal: 1.97 });
    const again = (await call(ctx, 'attach_takeout_items', args)).json();
    expect(again).toMatchObject({ attached: 0, alreadyAttached: 1 });
    expect(again.unreconciled).toBeUndefined();
    expect(m('takeoutdetails').size).toBe(1);
  });
  it('reports a missing order and creates nothing', async () => {
    const { ctx, m } = setup();
    const r = (await call(ctx, 'attach_takeout_items', { orders: [{ sourceId: 'nope', items: ITEMS }] })).json();
    expect(r.missingOrders).toEqual(['wolt-nope']);
    expect(m('takeoutdetails').size).toBe(0);
  });
  it('flags items + fees that do not reach the total without failing', async () => {
    const { ctx } = setup({ woltorders: [{ ...ORDER, total: 35 }] });
    const r = (await call(ctx, 'attach_takeout_items', { orders: [{ sourceId: 'abc', items: ITEMS, feesTotal: 1.97 }] })).json();
    expect(r.attached).toBe(1);
    expect(r.unreconciled[0]).toContain('tip');
  });
});

describe('add_wolt_orders with items', () => {
  it('saves the order and its items together, safely twice', async () => {
    const { ctx, m } = setup();
    const args = { orders: [{ sourceId: 'abc', restaurant: 'Tian Tan', date: '2026-11-15', total: 30.17, items: ITEMS, feesTotal: 1.97 }] };
    expect((await call(ctx, 'add_wolt_orders', args)).json()).toMatchObject({ added: 1, itemsAttached: 1 });
    expect((await call(ctx, 'add_wolt_orders', args)).json()).toMatchObject({ added: 0, alreadyAdded: 1, itemsAttached: 0, itemsAlreadyAttached: 1 });
    expect(m('takeoutdetails').size).toBe(1);
  });
});

describe('ratings and reads', () => {
  const seed = () => setup({ woltorders: [ORDER, { ...ORDER, id: 'wolt-2', date: '2026-11-01', total: 20 }] });
  async function withItems() {
    const s = seed();
    await call(s.ctx, 'attach_takeout_items', { orders: [{ sourceId: 'abc', items: ITEMS }, { sourceId: '2', items: [ITEMS[1]] }] });
    return s;
  }
  it('asks about unrated dishes, then stops once rated', async () => {
    const { ctx } = await withItems();
    expect((await call(ctx, 'list_unrated_dishes', {})).json().total).toBe(3);
    expect((await call(ctx, 'rate_dish', { venue: 'tian', dish: 'pohana', verdict: 'liked', note: 'less sauce' })).json()).toMatchObject({ saved: true, verdict: 'liked' });
    expect((await call(ctx, 'list_unrated_dishes', {})).json().total).toBe(2);
  });
  it('refuses an ambiguous dish and saves nothing', async () => {
    const { ctx, m } = await withItems();
    const r = await call(ctx, 'rate_dish', { venue: 'Tian Tan', dish: 'juha', verdict: 'liked' });
    expect(r.error).toBe(true);
    expect(r.text).toContain('Several dishes');
    expect(m('dishfeedback').size).toBe(0);
  });
  it('searches and ranks', async () => {
    const { ctx } = await withItems();
    const s = (await call(ctx, 'search_takeout_items', { venue: 'Tian Tan', query: 'piletina' })).json();
    expect(s.dishes[0]).toMatchObject({ count: 4, orders: 2, spent: 44 });
    const t = (await call(ctx, 'takeout_top', { by: 'spend' })).json();
    expect(t.topDishes[0].dish).toContain('Pohana');
    expect(t.topVenues[0]).toMatchObject({ venue: 'Tian Tan', orders: 2 });
  });
  it('is read only where it must be', async () => {
    const { ctx } = seed();
    ctx.readOnly = true;
    expect((await call(ctx, 'attach_takeout_items', { orders: [] })).error).toBe(true);
    expect((await call(ctx, 'takeout_top', {})).error).toBeFalsy();
  });
});

describe('stats with dishes', () => {
  async function ready() {
    const s = setup({
      woltorders: [ORDER],
      foodreceipts: [{ id: 'r1', store: 'Konzum', date: '2026-11-10', total: 5, lines: [{ name: 'Milk', kind: 'food', paid: 5, quantity: 1, unit: 'pc', unitPrice: 5 }] }],
    });
    await call(s.ctx, 'attach_takeout_items', { orders: [{ sourceId: 'abc', items: ITEMS, feesTotal: 1.97 }] });
    return s;
  }
  it('adds the items to day_summary', async () => {
    const { ctx } = await ready();
    const d = (await call(ctx, 'day_summary', { date: '2026-11-15' })).json();
    expect(d.takeout[0].items).toContain('2× Pohana piletina u slatko - kiselom umaku');
  });
  it('adds the top dishes to weekly_digest', async () => {
    const { ctx } = await ready();
    const d = (await call(ctx, 'weekly_digest', { end: '2026-11-17' })).json();
    expect(JSON.stringify(d)).toContain('Pohana piletina');
  });
  it('keeps takeout apart from grocery figures in food_stats', async () => {
    const { ctx } = await ready();
    const f = (await call(ctx, 'food_stats', {})).json();
    expect(f.takeout.topDishes[0].dish).toContain('Pohana');
    expect(f.totalFoodSpend).toBe(5);
  });
});
