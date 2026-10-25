// Tools exposed to Claude over MCP (see mcp.ts). Reads come straight from D1;
// logging a wear goes through the `inbox` store so the app applies it with its
// own wear logic. New items and outfits have fresh ids, so they can be written
// directly without risking a clobbered edit.

import { CATEGORIES, SEASONS } from '../src/modules/clothes/types';
import type { WearRequest } from './protocol';
import type { RecordStore, Row } from './records';

export interface ToolContext {
  store: RecordStore;
  readOnly: boolean;
  now: Date;
  newId: () => string;
}

export interface ToolImage {
  caption: string;
  mimeType: string;
  /** Base64, without the data: prefix. */
  data: string;
}

export interface ToolResult {
  text: string;
  isError?: boolean;
  images?: ToolImage[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_IDS = 30;
/** Photos shown per call, and the largest one sent (base64 characters), to keep chat replies light. */
const MAX_PHOTOS = 8;
const MAX_PHOTO_LENGTH = 600_000;

const fail = (text: string): ToolResult => ({ text, isError: true });
const ok = (value: unknown): ToolResult => ({ text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) });

export const TOOLS = [
  {
    name: 'find_items',
    description:
      'Search the wardrobe (active items) by words in name, brand, colour, category or tags. Use it to resolve what the user says they wore into item ids. Returns id, name, category, brand, color, times worn and last worn date. When several items could match, or the user asks to see something, follow up with show_photos so they can pick by sight.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words that must all match, e.g. "navy blazer". Empty lists everything.' },
        category: { type: 'string', enum: [...CATEGORIES] },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 25.' },
      },
    },
  },
  {
    name: 'list_outfits',
    description: 'List saved outfits with their pieces and when they were last worn. Optionally filter by words in the name or tags.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  {
    name: 'show_photos',
    description:
      'Show the photos of items (and of the pieces of outfits) in the chat. Use it whenever there is any doubt about which item the user means, before logging if a match is ambiguous, and whenever the user asks to see an item, an outfit or what they wore. Up to 8 photos per call; items without a photo are listed by name.',
    inputSchema: {
      type: 'object',
      properties: {
        itemIds: { type: 'array', items: { type: 'string' } },
        outfitIds: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'get_wear_log',
    description:
      'What was logged as worn on each of the last N days (newest first), plus wear requests that are queued but not yet applied by the app. Use it to check whether a day is already logged.',
    inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90, description: 'Default 14.' } } },
  },
  {
    name: 'log_wear',
    description:
      'Log that the user wore items and/or whole outfits on a date. Wearing an outfit also logs each of its pieces, so do not list those pieces again. Resolve ids with find_items / list_outfits first and confirm ambiguous matches with the user. When two or more items are logged together without an outfit, an outfit is saved for them automatically, or an existing outfit with exactly those pieces is reused. If an existing outfit overlaps but differs (it has extra pieces the user may not have mentioned, or lacks some), nothing is logged and the candidates are returned: ask the user (show_photos helps), then call again with that outfit in outfitIds, or with createNewOutfit=true. The wear shows up in the app the next time it syncs.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD, in the user’s local calendar. "Today" and "yesterday" must be turned into a date.' },
        itemIds: { type: 'array', items: { type: 'string' } },
        outfitIds: { type: 'array', items: { type: 'string' } },
        outfitName: { type: 'string', description: 'Optional name for the outfit created from itemIds, e.g. "Grey sweats + white tee".' },
        createNewOutfit: { type: 'boolean', description: 'Only after the user confirmed that similar existing outfits are not what they wore.' },
      },
      required: ['date'],
    },
  },
  {
    name: 'add_item',
    description: 'Add a new item to the wardrobe. Check find_items first to avoid duplicates.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: { type: 'string', enum: [...CATEGORIES] },
        brand: { type: 'string' },
        color: { type: 'string', description: 'Free text, e.g. "Navy" or "Black & white".' },
        size: { type: 'string' },
        material: { type: 'string' },
        price: { type: 'number', minimum: 0 },
        purchaseDate: { type: 'string', description: 'YYYY-MM-DD' },
        seasons: { type: 'array', items: { type: 'string', enum: [...SEASONS] } },
        tags: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['name', 'category'],
    },
  },
  {
    name: 'create_outfit',
    description: 'Save a set of existing items as an outfit. To log wearing it, call log_wear with the returned id.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        itemIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['itemIds'],
    },
  },
] as const;

type Args = Record<string, unknown>;

export async function callTool(name: string, args: Args, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case 'find_items':
      return findItems(args, ctx);
    case 'list_outfits':
      return listOutfits(args, ctx);
    case 'show_photos':
      return showPhotos(args, ctx);
    case 'get_wear_log':
      return getWearLog(args, ctx);
    case 'log_wear':
      return ctx.readOnly ? fail(READ_ONLY) : logWear(args, ctx);
    case 'add_item':
      return ctx.readOnly ? fail(READ_ONLY) : addItem(args, ctx);
    case 'create_outfit':
      return ctx.readOnly ? fail(READ_ONLY) : createOutfit(args, ctx);
    default:
      return fail(`Unknown tool: ${name}`);
  }
}

const READ_ONLY = 'This deployment is read-only.';

// ---- helpers ----

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const wearsOf = (r: Row): string[] => strings(r.wears);
const timesWorn = (r: Row): number => wearsOf(r).length + (typeof r.priorWears === 'number' ? r.priorWears : 0);
const lastWorn = (r: Row): string | null => wearsOf(r).reduce<string | null>((a, b) => (!a || b > a ? b : a), null);

function text(v: unknown, max = 200): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

function isRealDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  return new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const utcToday = (now: Date) => now.toISOString().slice(0, 10);

function matches(fields: string[], query: string): boolean {
  const hay = fields.join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function itemSummary(r: Row) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    ...(r.brand ? { brand: r.brand } : {}),
    ...(r.color ? { color: r.color } : {}),
    timesWorn: timesWorn(r),
    lastWorn: lastWorn(r),
  };
}

// ---- reads ----

async function findItems(args: Args, { store }: ToolContext): Promise<ToolResult> {
  const query = text(args.query) ?? '';
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 50);
  const rows = (await store.list('clothes'))
    .filter((r) => r.status === 'active' || r.status === undefined)
    .filter((r) => !args.category || r.category === args.category)
    .filter((r) => matches([String(r.name ?? ''), String(r.brand ?? ''), String(r.color ?? ''), String(r.category ?? ''), ...strings(r.tags)], query))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return ok({ total: rows.length, items: rows.slice(0, limit).map(itemSummary) });
}

async function listOutfits(args: Args, { store }: ToolContext): Promise<ToolResult> {
  const query = text(args.query) ?? '';
  const names = new Map((await store.list('clothes')).map((r) => [r.id, String(r.name)]));
  const outfits = (await store.list('outfits'))
    .filter((o) => matches([String(o.name ?? ''), ...strings(o.tags)], query))
    .sort((a, b) => (lastWorn(b) ?? '').localeCompare(lastWorn(a) ?? ''))
    .map((o) => ({
      id: o.id,
      name: o.name ?? '(unnamed)',
      pieces: strings(o.itemIds).map((id) => ({ id, name: names.get(id) ?? '(deleted item)' })),
      timesWorn: timesWorn(o),
      lastWorn: lastWorn(o),
    }));
  return ok({ outfits });
}

async function getWearLog(args: Args, { store, now }: ToolContext): Promise<ToolResult> {
  const days = Math.min(Math.max(Number(args.days) || 14, 1), 90);
  const since = addDays(utcToday(now), -days);
  const [items, outfits, inbox] = await Promise.all([store.list('clothes'), store.list('outfits'), store.list('inbox')]);

  const log = new Map<string, { outfits: string[]; items: string[] }>();
  const day = (d: string) => log.get(d) ?? (log.set(d, { outfits: [], items: [] }), log.get(d)!);
  for (const o of outfits) for (const d of new Set(wearsOf(o))) if (d >= since) day(d).outfits.push(String(o.name ?? '(unnamed outfit)'));
  for (const i of items) {
    for (const d of new Set(wearsOf(i))) {
      if (d < since) continue;
      const inOutfit = outfits.some((o) => wearsOf(o).includes(d) && strings(o.itemIds).includes(i.id));
      if (!inOutfit) day(d).items.push(String(i.name));
    }
  }

  const names = new Map([...items, ...outfits].map((r) => [r.id, String(r.name ?? '(unnamed outfit)')]));
  const pending = inbox
    .filter((e) => e.type === 'wear' && !e.appliedAt)
    .map((e) => ({ date: e.date, names: [...strings(e.itemIds), ...strings(e.outfitIds)].map((id) => names.get(id) ?? id) }));

  return ok({
    today_utc: utcToday(now),
    days: [...log.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, v]) => ({ date, ...v })),
    queued_not_yet_in_app: pending,
  });
}

async function showPhotos(args: Args, { store }: ToolContext): Promise<ToolResult> {
  const [items, outfits] = await Promise.all([store.list('clothes'), store.list('outfits')]);
  const itemName = new Map(items.map((r) => [r.id, String(r.name)]));
  const outfitById = new Map(outfits.map((r) => [r.id, r]));

  // Each wanted piece, labelled by the outfit it came from when it did.
  const wanted = new Map<string, string>();
  for (const id of [...new Set(strings(args.outfitIds))]) {
    const outfit = outfitById.get(id);
    if (!outfit) return fail(`Unknown outfit id: ${id}.`);
    for (const pid of strings(outfit.itemIds)) {
      if (!wanted.has(pid)) wanted.set(pid, `${itemName.get(pid) ?? '(deleted item)'} · from “${outfit.name ?? 'unnamed outfit'}”`);
    }
  }
  for (const id of [...new Set(strings(args.itemIds))]) {
    if (!itemName.has(id)) return fail(`Unknown item id: ${id}.`);
    wanted.set(id, itemName.get(id)!);
  }
  if (wanted.size === 0) return fail('Give at least one item id or outfit id.');

  const ids = [...wanted.keys()].filter((id) => itemName.has(id)).slice(0, MAX_PHOTOS);
  const photos = await store.photos(ids);
  const images: ToolImage[] = [];
  const without: string[] = [];
  for (const id of ids) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(photos.get(id) ?? '');
    if (match && match[2].length <= MAX_PHOTO_LENGTH) images.push({ caption: wanted.get(id)!, mimeType: match[1], data: match[2] });
    else without.push(wanted.get(id)!);
  }
  const more = wanted.size > ids.length ? ` ${wanted.size - ids.length} more not shown (limit ${MAX_PHOTOS}).` : '';
  const missing = without.length ? ` No photo for: ${without.join(', ')}.` : '';
  return { text: `Showing ${images.length} photo${images.length === 1 ? '' : 's'}.${missing}${more}`, images };
}

// ---- writes ----

async function logWear(args: Args, { store, now, newId }: ToolContext): Promise<ToolResult> {
  if (!isRealDate(args.date)) return fail('date must be a real calendar date in YYYY-MM-DD form.');
  // One day of slack for users whose local date is ahead of UTC.
  if (args.date > addDays(utcToday(now), 1)) return fail('Can’t log a wear in the future.');
  let itemIds = [...new Set(strings(args.itemIds))];
  let outfitIds = [...new Set(strings(args.outfitIds))];
  if (itemIds.length + outfitIds.length === 0) return fail('Give at least one item id or outfit id.');
  if (itemIds.length + outfitIds.length > MAX_IDS) return fail(`At most ${MAX_IDS} ids per call.`);

  const [items, outfits, inbox] = await Promise.all([store.list('clothes'), store.list('outfits'), store.list('inbox')]);
  const itemById = new Map(items.map((r) => [r.id, r]));
  const outfitById = new Map(outfits.map((r) => [r.id, r]));
  const unknown = [...itemIds.filter((id) => !itemById.has(id)), ...outfitIds.filter((id) => !outfitById.has(id))];
  if (unknown.length) return fail(`Unknown ids: ${unknown.join(', ')}. Look them up with find_items / list_outfits.`);

  // Pieces worn together become an outfit, without ever duplicating one.
  let createdOutfit: { id: string; name: string } | undefined;
  if (outfitIds.length === 0 && itemIds.length >= 2) {
    const mine = new Set(itemIds);
    const pieces = (o: Row) => new Set(strings(o.itemIds));
    const exact = outfits.find((o) => pieces(o).size === mine.size && [...mine].every((id) => pieces(o).has(id)));
    if (exact) {
      outfitIds = [exact.id];
      itemIds = [];
    } else {
      // Overlapping outfits might be the same look with a piece left out (or added), so don't guess.
      const similar = outfits.filter((o) => {
        const p = pieces(o);
        const superset = [...mine].every((id) => p.has(id));
        const subset = p.size >= 2 && [...p].every((id) => mine.has(id));
        return superset || subset;
      });
      if (similar.length > 0 && args.createNewOutfit !== true) {
        const name = (id: string) => String(itemById.get(id)?.name ?? '(deleted item)');
        const candidates = similar.map((o) => ({
          outfitId: o.id,
          name: o.name ?? '(unnamed outfit)',
          pieces: [...pieces(o)].map(name),
          alsoInThisOutfit: [...pieces(o)].filter((id) => !mine.has(id)).map(name),
          notInThisOutfit: [...mine].filter((id) => !pieces(o).has(id)).map(name),
        }));
        return ok(
          'NOT LOGGED YET. These saved outfits overlap with what the user listed, and one may be the same look with a piece left out or added:\n' +
            JSON.stringify(candidates, null, 1) +
            '\nAsk the user which it was (show_photos helps). If it is one of these, call log_wear again with outfitIds=[its id] (plus itemIds for anything extra they wore). If it is a new combination, call again with the same itemIds and createNewOutfit=true.',
        );
      }
      const stamp = now.toISOString();
      const outfit = { id: newId(), name: text(args.outfitName), itemIds, wears: [], createdAt: stamp, updatedAt: stamp };
      await store.put('outfits', outfit.id, outfit);
      createdOutfit = { id: outfit.id, name: outfit.name ?? '(unnamed)' };
      outfits.push({ id: outfit.id, name: outfit.name, itemIds, wears: [] });
      outfitIds = [outfit.id];
      itemIds = [];
    }
  }

  // A retry of the same request while it's still queued must not queue twice.
  const key = (d: unknown, i: string[], o: string[]) => `${d}|${[...i].sort()}|${[...o].sort()}`;
  const duplicate = inbox.find(
    (e) => e.type === 'wear' && !e.appliedAt && key(e.date, strings(e.itemIds), strings(e.outfitIds)) === key(args.date, itemIds, outfitIds),
  );
  const outfitNow = new Map(outfits.map((r) => [r.id, r]));
  const names = [...outfitIds.map((id) => outfitNow.get(id)!), ...itemIds.map((id) => itemById.get(id)!)].map((r) => String(r.name ?? '(unnamed outfit)'));
  if (duplicate) return ok(`Already queued for ${args.date}: ${names.join(', ')}.`);

  const stamp = now.toISOString();
  const request: WearRequest = {
    id: newId(),
    type: 'wear',
    date: args.date,
    itemIds,
    outfitIds,
    source: 'claude',
    createdAt: stamp,
    updatedAt: stamp,
  };
  await store.put('inbox', request.id, request);
  const outfitNote = createdOutfit ? ` Saved these pieces as a new outfit (${createdOutfit.name}, id ${createdOutfit.id}).` : '';
  return ok(`Queued a wear for ${args.date}: ${names.join(', ')}.${outfitNote} It appears in the app the next time it syncs (about a minute if the app is open).`);
}

async function addItem(args: Args, { store, now, newId }: ToolContext): Promise<ToolResult> {
  const name = text(args.name);
  if (!name) return fail('name is required.');
  if (!(CATEGORIES as readonly string[]).includes(args.category as string)) return fail(`category must be one of: ${CATEGORIES.join(', ')}.`);
  if (args.purchaseDate !== undefined && !isRealDate(args.purchaseDate)) return fail('purchaseDate must be YYYY-MM-DD.');
  if (args.price !== undefined && !(typeof args.price === 'number' && args.price >= 0)) return fail('price must be a non-negative number.');

  const stamp = now.toISOString();
  const tags = strings(args.tags).map((t) => t.trim().slice(0, 50)).filter(Boolean).slice(0, 20);
  const item = {
    id: newId(),
    name,
    category: args.category,
    brand: text(args.brand),
    color: text(args.color),
    size: text(args.size, 50),
    material: text(args.material),
    price: args.price,
    purchaseDate: args.purchaseDate,
    notes: text(args.notes, 1000),
    tags: tags.length ? tags : undefined,
    seasons: strings(args.seasons).filter((s) => (SEASONS as readonly string[]).includes(s)),
    status: 'active',
    wears: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  await store.put('clothes', item.id, item);
  return ok({ added: { id: item.id, name } });
}

async function createOutfit(args: Args, { store, now, newId }: ToolContext): Promise<ToolResult> {
  const itemIds = [...new Set(strings(args.itemIds))];
  if (itemIds.length === 0) return fail('Give at least one item id.');
  if (itemIds.length > MAX_IDS) return fail(`At most ${MAX_IDS} items per outfit.`);
  const known = new Set((await store.list('clothes')).map((r) => r.id));
  const unknown = itemIds.filter((id) => !known.has(id));
  if (unknown.length) return fail(`Unknown item ids: ${unknown.join(', ')}.`);

  const stamp = now.toISOString();
  const tags = strings(args.tags).map((t) => t.trim().slice(0, 50)).filter(Boolean).slice(0, 20);
  const outfit = {
    id: newId(),
    name: text(args.name),
    itemIds,
    tags: tags.length ? tags : undefined,
    wears: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  await store.put('outfits', outfit.id, outfit);
  return ok({ created: { id: outfit.id, name: outfit.name ?? '(unnamed)' } });
}
