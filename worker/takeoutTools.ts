// MCP tools for what was ordered: attach the item lines Claude read from the Wolt PDFs to a takeout order, record whether
// you liked a dish, and read it all back (search, top dishes and venues, dishes still to rate). Tools never edit a record:
// details are one fresh `takeoutdetails` record per order (adding again changes nothing) and each like / note is a fresh
// `dishfeedback` record, the newest one for a dish winning. Item lines are in the order's currency.

import { dishLines, filterLines, groupByDish, latestFeedback, mergeFeedback, priceTrend, topDishes, topVenues, unratedDishes } from '../src/modules/wolt/dishes';
import { itemsSubtotal } from '../src/modules/wolt/receiptPdf';
import type { DishFeedback, TakeoutDetail, TakeoutItem, TakeoutService } from '../src/modules/wolt/types';
import { round2 } from '../src/modules/wolt/wolt';
import type { ToolContext, ToolResult } from './mcpTools';
import type { Row } from './records';
import { addDays, fail, isRealDate, ok, text, utcToday, type Args } from './toolUtil';

const READ_ONLY = 'This deployment is read-only.';
const MAX_ITEMS = 100;

const money = (v: unknown, min = 0, max = 10_000): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? round2(v) : undefined);
const clip = (v: unknown, max: number) => text(v, max);

export const ITEMS_SCHEMA = {
  type: 'array',
  maxItems: MAX_ITEMS,
  description:
    'Item lines from the "Potvrda narudžbe" PDF attached to the Wolt email (the PDF whose title is "Potvrda narudžbe", not the one titled "Račun …", which is Wolt\'s fee invoice). One entry per row of the table: name exactly as printed (wrapped lines joined with a space), qty (Količina), unitPrice (Bruto jedinična cijena), linePrice (Cijena), vat (% PDV-a). Prices use a decimal comma in the PDF: pass numbers. Never translate or tidy the name.',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      qty: { type: 'number', minimum: 0 },
      unitPrice: { type: 'number' },
      linePrice: { type: 'number' },
      vat: { type: 'number' },
    },
    required: ['name', 'qty', 'unitPrice'],
  },
} as const;

export const DETAIL_PROPS = {
  items: ITEMS_SCHEMA,
  paymentMethod: { type: 'string', description: 'Način plaćanja, e.g. "Revolut Pay".' },
  orderType: { type: 'string', description: 'Vrsta narudžbe, e.g. "Dostava" (delivery).' },
  feesTotal: { type: 'number', description: 'Total of Wolt\'s own fee invoice ("Račun …": delivery, service fee), if the email had one.' },
  invoiceNo: { type: 'string', description: 'Number of that fee invoice, e.g. "60298/1/23".' },
} as const;

export interface ParsedDetail {
  detail?: Omit<TakeoutDetail, 'id' | 'orderId' | 'createdAt' | 'updatedAt'>;
  /** Things worth telling Claude: a line whose price doesn't match qty × unit price, items that were dropped. */
  warnings: string[];
  error?: string;
}

/** Validates the untrusted item fields of one order. The subtotal is always recomputed from the lines. */
export function parseDetail(r: Record<string, unknown>): ParsedDetail {
  const warnings: string[] = [];
  if (!Array.isArray(r.items) || r.items.length === 0) return { warnings, error: 'items must be a non-empty list' };
  if (r.items.length > MAX_ITEMS) return { warnings, error: `more than ${MAX_ITEMS} item lines: nothing saved, check the PDF` };
  const items: TakeoutItem[] = [];
  for (const [i, raw] of r.items.entries()) {
    const x = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const name = clip(x.name, 200)?.replace(/[​-‏‪-‮⁦-⁩﻿]/g, '');
    const qty = money(x.qty, 0.001, 999);
    const unitPrice = money(x.unitPrice, -1000, 10_000);
    const linePrice = x.linePrice === undefined ? (qty !== undefined && unitPrice !== undefined ? round2(qty * unitPrice) : undefined) : money(x.linePrice, -1000, 10_000);
    if (!name || qty === undefined || unitPrice === undefined || linePrice === undefined) {
      warnings.push(`item #${i + 1} dropped: needs name, qty, unitPrice and a readable linePrice`);
      continue;
    }
    if (Math.abs(round2(qty * unitPrice) - linePrice) > 0.02) warnings.push(`"${name}": qty × unitPrice is ${round2(qty * unitPrice)} but linePrice is ${linePrice}; check the PDF`);
    const vat = money(x.vat, 0, 100);
    items.push({ name, qty, unitPrice, linePrice, vat: vat ?? 0 });
  }
  if (items.length === 0) return { warnings, error: 'no usable item lines' };
  const feesTotal = money(r.feesTotal);
  return {
    warnings,
    detail: {
      items,
      itemsSubtotal: itemsSubtotal(items),
      ...(feesTotal !== undefined ? { feesTotal } : {}),
      ...(clip(r.invoiceNo, 40) ? { invoiceNo: clip(r.invoiceNo, 40) } : {}),
      ...(clip(r.paymentMethod, 60) ? { paymentMethod: clip(r.paymentMethod, 60) } : {}),
      ...(clip(r.orderType, 40) ? { orderType: clip(r.orderType, 40) } : {}),
    },
  };
}

/** True when items + Wolt's fee invoice reach the order's total (a tip or other extra makes up the rest otherwise). */
function reconcile(total: number, d: NonNullable<ParsedDetail['detail']>): string | undefined {
  const rest = round2(total - d.itemsSubtotal - (d.feesTotal ?? 0));
  return Math.abs(rest) > 0.02 ? `${rest > 0 ? 'other charges (tip?)' : 'less than the items'} ${rest.toFixed(2)}` : undefined;
}

export async function writeDetails(ctx: ToolContext, entries: { orderId: string; total: number; detail: NonNullable<ParsedDetail['detail']> }[]) {
  const known = new Set((await ctx.store.list('takeoutdetails')).map((r) => r.id));
  const stamp = ctx.now.toISOString();
  let attached = 0;
  const unreconciled: string[] = [];
  for (const e of entries) {
    const id = `td-${e.orderId}`;
    if (known.has(id)) continue;
    const gap = reconcile(e.total, e.detail);
    if (gap) unreconciled.push(`${e.orderId}: items ${e.detail.itemsSubtotal.toFixed(2)} + fees ${(e.detail.feesTotal ?? 0).toFixed(2)} vs order ${e.total.toFixed(2)}, ${gap}`);
    await ctx.store.put('takeoutdetails', id, { id, orderId: e.orderId, ...e.detail, createdAt: stamp, updatedAt: stamp });
    known.add(id);
    attached++;
  }
  return { attached, alreadyAttached: entries.length - attached, unreconciled };
}

export const TAKEOUT_TOOLS = [
  {
    name: 'attach_takeout_items',
    description:
      'Attach the item lines to takeout orders that are ALREADY in the takeout log (added earlier with add_wolt_orders / add_takeout_orders). Per order give sourceId (the same id used to add it: for Wolt the "ID narudžbe" from the PDF), service ("wolt" default, "bolt", "uber") and the fields read from the Wolt PDFs: items, paymentMethod, orderType and, from the second PDF ("Račun …", Wolt\'s fee invoice), feesTotal and invoiceNo. Idempotent: an order that already has items is skipped and reported under alreadyAttached, so calling it twice never duplicates lines. An order that is not in the log is reported under missingOrders and nothing is created: add it with add_wolt_orders first (or pass items there). The item subtotal is recomputed from the lines; the difference to the order total is "fees and other" (delivery, service fee, tip) and is not an error, but unreconciled lists orders where items + feesTotal do not add up to the total. Details are never edited afterwards from here.',
    inputSchema: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: { sourceId: { type: 'string' }, service: { type: 'string', enum: ['wolt', 'bolt', 'uber'] }, ...DETAIL_PROPS },
            required: ['sourceId', 'items'],
          },
        },
      },
      required: ['orders'],
    },
  },
  {
    name: 'rate_dish',
    description:
      'Record whether the user liked a dish they ordered, and/or a note about it ("less sauce next time"). venue + dish are matched against what was ordered (words are enough; if several dishes match, the tool lists them and nothing is saved: ask the user which). verdict = liked, disliked or meh. It is kept per dish at a venue, so it applies to every order of it; a newer answer replaces the older one (the history stays). Use list_unrated_dishes to find what to ask about, and ask only when the user has just ordered or brings it up; never guess a verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        venue: { type: 'string' },
        dish: { type: 'string', description: 'Words from the dish name as ordered.' },
        verdict: { type: 'string', enum: ['liked', 'disliked', 'meh'] },
        note: { type: 'string' },
      },
      required: ['venue', 'dish'],
    },
  },
  {
    name: 'list_unrated_dishes',
    description:
      'Dishes from recent takeout orders (default the last 14 days) that the user has not said whether they liked yet. CALL THIS at the start of a conversation about food, takeout or the week, and when a takeout order was just added; if it returns anything, ask the user briefly whether they liked each one (and whether they want a note), then save the answers with rate_dish. Do not nag: if they skip it, drop it for this chat. Read only.',
    inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365 }, limit: { type: 'integer', minimum: 1, maximum: 30 } } },
  },
  {
    name: 'search_takeout_items',
    description:
      'What was ordered through takeout (Wolt, Bolt Food, Uber Eats), from the item lines. Filter by venue (branches combined), words of the dish (accents ignored), from / to dates. Answers "what did I order at Tian Tan?" and "how often do I order X?": returns the dishes with pieces, orders and euro spend, the user\'s like / note for each, the price over time for what was ordered at least twice, and the newest order lines. Only orders whose items were added are covered (reported as coverage). Read only.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, venue: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } },
    },
  },
  {
    name: 'takeout_top',
    description:
      'Top dishes and top venues from takeout item lines over a period (from / to, default all time), dishes ranked by pieces (`by` "count", default) or euro spend ("spend"). Read only.',
    inputSchema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' }, by: { type: 'string', enum: ['count', 'spend'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } },
    },
  },
] as const;

const SERVICES = new Set<string>(['wolt', 'bolt', 'uber']);

async function load(ctx: ToolContext) {
  const [orders, details, groups, feedback] = await Promise.all([ctx.store.list('woltorders'), ctx.store.list('takeoutdetails'), ctx.store.list('dishgroups'), ctx.store.list('dishfeedback')]);
  const lines = dishLines(
    orders.map((o) => ({ ...o, restaurant: String(o.restaurant ?? ''), date: String(o.date ?? ''), currency: String(o.currency ?? 'EUR'), total: Number(o.total) || 0 }) as never),
    details as unknown as TakeoutDetail[],
    groups as unknown as { key: string; group: string }[],
  );
  return { orders, details, lines, feedback: latestFeedback(feedback as unknown as DishFeedback[]), feedbackRows: feedback };
}

async function attach(args: Args, ctx: ToolContext): Promise<ToolResult> {
  if (!Array.isArray(args.orders)) return fail('orders must be a list');
  const orders = new Map((await ctx.store.list('woltorders')).map((o) => [o.id, o]));
  const entries: { orderId: string; total: number; detail: NonNullable<ParsedDetail['detail']> }[] = [];
  const missingOrders: string[] = [];
  const rejected: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of args.orders.slice(0, 50).entries()) {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const sourceId = text(r.sourceId, 100)?.replace(/[^A-Za-z0-9_-]/g, '');
    const service = typeof r.service === 'string' && SERVICES.has(r.service) ? (r.service as TakeoutService) : 'wolt';
    if (!sourceId) {
      rejected.push(`#${i + 1}: needs sourceId`);
      continue;
    }
    const id = `${service}-${sourceId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const order = orders.get(id);
    if (!order) {
      missingOrders.push(id);
      continue;
    }
    const p = parseDetail(r);
    warnings.push(...p.warnings.map((w) => `${id}: ${w}`));
    if (!p.detail) {
      rejected.push(`${id}: ${p.error}`);
      continue;
    }
    entries.push({ orderId: id, total: Number(order.total) || 0, detail: p.detail });
  }
  const res = await writeDetails(ctx, entries);
  return ok({
    attached: res.attached,
    alreadyAttached: res.alreadyAttached,
    ...(missingOrders.length ? { missingOrders, hint: 'These orders are not in the takeout log: add them with add_wolt_orders (items can go in the same call), then attach.' } : {}),
    ...(rejected.length ? { rejected } : {}),
    ...(res.unreconciled.length ? { unreconciled: res.unreconciled } : {}),
    ...(warnings.length ? { warnings } : {}),
  });
}

async function rate(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const venue = text(args.venue, 120);
  const dish = text(args.dish, 200);
  const verdict = args.verdict;
  const note = text(args.note, 500);
  if (!venue || !dish) return fail('venue and dish are required');
  if (verdict !== undefined && verdict !== 'liked' && verdict !== 'disliked' && verdict !== 'meh') return fail('verdict must be liked, disliked or meh');
  if (verdict === undefined && !note) return fail('give a verdict, a note or both');
  const { lines, feedback } = await load(ctx);
  const found = filterLines(lines, { venue, query: dish });
  const dishes = new Map(found.map((l) => [l.key, l]));
  if (dishes.size === 0) return fail(`No ordered dish matches "${dish}" at "${venue}". Use search_takeout_items to see what was ordered.`);
  if (dishes.size > 1) {
    const exact = [...dishes.values()].filter((l) => l.raw.toLowerCase() === dish.toLowerCase());
    if (exact.length !== 1) return fail(`Several dishes match, nothing saved. Ask the user which one: ${[...dishes.values()].map((l) => `"${l.raw}" (${l.venue})`).join('; ')}`);
    dishes.clear();
    dishes.set(exact[0].key, exact[0]);
  }
  const l = [...dishes.values()][0];
  const id = `dfb-${ctx.newId()}`;
  const stamp = ctx.now.toISOString();
  // The newest record wins as a whole, so carry over what this call doesn't change (a note keeps the verdict and the other way round).
  const merged = mergeFeedback(feedback.get(l.key), { verdict: verdict as DishFeedback['verdict'] | undefined, note });
  await ctx.store.put('dishfeedback', id, { id, key: l.key, venue: l.venue, dish: l.raw, ...merged, at: stamp, createdAt: stamp, updatedAt: stamp });
  return ok({ saved: true, venue: l.venue, dish: l.raw, ...merged });
}

async function unrated(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const days = Math.min(Math.max(Math.floor(Number(args.days)) || 14, 1), 365);
  const limit = Math.min(Math.max(Math.floor(Number(args.limit)) || 10, 1), 30);
  const { lines, feedback } = await load(ctx);
  const rows = unratedDishes(lines, feedback, addDays(utcToday(ctx.now), -days));
  return ok({ unrated: rows.slice(0, limit).map((r) => ({ venue: r.venue, dish: r.raw, lastOrdered: r.lastOrdered })), total: rows.length, since: addDays(utcToday(ctx.now), -days) });
}

function range(args: Args): { from?: string; to?: string } | string {
  for (const k of ['from', 'to'] as const) if (args[k] !== undefined && !isRealDate(args[k])) return `${k} must be a real date in YYYY-MM-DD form.`;
  return { from: args.from as string | undefined, to: args.to as string | undefined };
}

const limitOf = (v: unknown, fallback: number, max: number) => Math.min(Math.max(Math.floor(Number(v)) || fallback, 1), max);

async function search(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const r = range(args);
  if (typeof r === 'string') return fail(r);
  const { orders, details, lines, feedback } = await load(ctx);
  const found = filterLines(lines, { query: text(args.query), venue: text(args.venue), ...r });
  const limit = limitOf(args.limit, 15, 100);
  const groups = groupByDish(found);
  const dishes = topDishes(found).slice(0, limit).map((d) => {
    const group = groups.get(d.dish.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()) ?? [];
    const trend = priceTrend(group, d.dish);
    return {
      ...d,
      ...(d.spent === 0 ? { spent: undefined } : {}),
      feedback: [...new Set(group.map((l) => l.key))].map((k) => feedback.get(k)).find((f) => f?.verdict || f?.note) ?? undefined,
      priceOverTime: trend.length >= 2 ? trend : undefined,
    };
  });
  return ok({
    matches: found.length,
    dishes,
    latest: found.slice(0, limit).map((l) => ({ date: l.date, venue: l.venue, item: l.raw, qty: l.qty, unitPrice: l.unitPrice, currency: l.currency })),
    coverage: `${details.length} of ${orders.length} takeout orders have item lines`,
  });
}

async function top(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const r = range(args);
  if (typeof r === 'string') return fail(r);
  const { orders, details, lines } = await load(ctx);
  const inRange = filterLines(lines, r);
  const limit = limitOf(args.limit, 10, 50);
  return ok({
    from: r.from, to: r.to,
    topDishes: topDishes(inRange, args.by === 'spend' ? 'spend' : 'count').slice(0, limit),
    topVenues: topVenues(inRange).slice(0, limit),
    coverage: `${details.length} of ${orders.length} takeout orders have item lines`,
  });
}

export async function callTakeoutTool(name: string, args: Args, ctx: ToolContext): Promise<ToolResult | undefined> {
  switch (name) {
    case 'attach_takeout_items':
      return ctx.readOnly ? fail(READ_ONLY) : attach(args, ctx);
    case 'rate_dish':
      return ctx.readOnly ? fail(READ_ONLY) : rate(args, ctx);
    case 'list_unrated_dishes':
      return unrated(args, ctx);
    case 'search_takeout_items':
      return search(args, ctx);
    case 'takeout_top':
      return top(args, ctx);
    default:
      return undefined;
  }
}

export type { Row };
