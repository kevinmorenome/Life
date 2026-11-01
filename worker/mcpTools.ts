// Tools exposed to Claude over MCP (see mcp.ts). Reads come straight from D1;
// logging a wear goes through the `inbox` store so the app applies it with its
// own wear logic. New items and outfits have fresh ids, so they can be written
// directly without risking a clobbered edit.

import { PALETTE, itemColors } from '../src/modules/clothes/colors';
import { LINE_KINDS, PRODUCT_TYPES, STORAGES, UNITS } from '../src/modules/food/types';
import { CATEGORIES, CONDITIONS, SEASONS, STATUSES } from '../src/modules/clothes/types';
import type { ItemChanges, ItemEditRequest, OutfitEditRequest, PhotoRequest, TagRequest, WearRequest } from './protocol';
import { PHOTOS_URI } from './photosView';
import { canonicalName, defaultStorage, defaultType, isStocked, normalizeKey, productId, productSummaries, type ProductSummary } from '../src/modules/food/products';
import { formatQty, partLeft, stockOf, type Stock } from '../src/modules/food/stock';
import type { FoodProduct, FoodReceipt, StockEvent } from '../src/modules/food/types';
import { parseGroceryReceipt } from './groceries';
import { fetchPhoto, findDuplicate, parseReceiptLines, receiptItem } from './receipt';
import type { RecordStore, Row } from './records';

export interface ToolContext {
  store: RecordStore;
  /** Origin of the app, e.g. https://life.example.workers.dev, for links back into it. */
  appUrl: string;
  readOnly: boolean;
  now: Date;
  newId: () => string;
  /** Downloads a product image as a data URL (undefined if unusable). Faked in tests. */
  fetchPhoto?: (url: string) => Promise<string | undefined>;
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
  /** Data for the in-chat view (MCP Apps), kept out of the model's context by hosts. */
  structured?: Record<string, unknown>;
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
    // Hosts that support MCP Apps render this gallery in the chat; others only get the result below.
    _meta: { ui: { resourceUri: PHOTOS_URI }, 'ui/resourceUri': PHOTOS_URI },
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
    name: 'add_tags',
    description:
      'Add style/mood/occasion tags (for example "cozy", "pajamas", "work", "date night") to items and/or outfits. Only call this when the user themselves says something that describes the style, mood or occasion of what they wore ("I stayed in pajamas all day", "that was my gym fit"). Never infer tags, never tag on your own initiative, and never remove tags. Reuse tags already shown in find_items / list_outfits when one fits. The tags show up in the app the next time it syncs.',
    inputSchema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5, description: 'Short lowercase words, at most 5.' },
        itemIds: { type: 'array', items: { type: 'string' } },
        outfitIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['tags'],
    },
  },
  {
    name: 'add_item',
    description:
      'Add a brand-new item to the wardrobe. Not for purchases found in emails or receipts (use add_receipt_items, which flags them for review), and never to change, re-photograph or replace an item that already exists: use edit_item for fields or set_item_photo for the photo, so its wear history stays with it. If an active item with the same name (and brand) already exists this is refused; pass allowDuplicate=true only when the user confirms it really is a second one.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: { type: 'string', enum: [...CATEGORIES] },
        subcategory: { type: 'string', description: 'Optional refinement of the category, e.g. "Polo shirt".' },
        brand: { type: 'string' },
        colors: { type: 'array', items: { type: 'string', enum: [...PALETTE] }, maxItems: 5, description: 'Colours from the app\'s swatch palette, e.g. ["Navy", "White"].' },
        size: { type: 'string' },
        material: { type: 'string' },
        price: { type: 'number', minimum: 0 },
        purchaseDate: { type: 'string', description: 'YYYY-MM-DD' },
        seasons: { type: 'array', items: { type: 'string', enum: [...SEASONS] } },
        tags: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
        imageUrl: { type: 'string', description: 'Optional https URL of a product photo to download and attach.' },
        allowDuplicate: { type: 'boolean', description: 'Add even though a similar item exists. Only when the user confirms.' },
      },
      required: ['name', 'category'],
    },
  },
  {
    name: 'add_receipt_items',
    description:
      'Add the clothes from a purchase receipt or order confirmation email to the closet, flagged "needs review" so the owner can check them in the app. They can be used in outfits and wears straight away. One call per email, with every wearable item actually bought (no shipping, tax or discounts). Fill in everything the email says: brand, colours, size, material, price per piece, order date, season, the product image URL and anything useful in notes (retailer, order number). Read each email in full, in its HTML version if your Gmail tool offers a choice: a plain-text view drops images and links. The order confirmation itself often has no product images, so before adding, find ALL the emails about the same order (confirmation, shipping, dispatch, delivery or collection notifications from the same shop usually show the products), take imageUrl and details from them, and add each item ONCE with everything found. If you only find the image afterwards, use set_item_photo, never add the item again. Leave out what the email does not say. Pass the email\'s message id as sourceId so the same email is never added twice. If an active item with the same name and brand already exists, that line is skipped and reported (use set_item_photo to give it a photo, edit_item for fields): never create a new item to replace an existing one and never retire the old one, because that splits its wear history. Pass allowDuplicates=true only when the user confirms they really bought a second one.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'Gmail message id of the receipt email' },
        allowDuplicates: { type: 'boolean', description: 'Add lines even if a similar item exists. Only when the user confirms.' },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Product name without brand or size' },
              category: { type: 'string', enum: [...CATEGORIES] },
              subcategory: { type: 'string', description: 'e.g. "Polo shirt"' },
              brand: { type: 'string' },
              colors: { type: 'array', items: { type: 'string', enum: [...PALETTE] }, maxItems: 5 },
              size: { type: 'string' },
              material: { type: 'string' },
              price: { type: 'number', minimum: 0, description: 'Price paid for one piece' },
              purchaseDate: { type: 'string', description: 'Order date, YYYY-MM-DD' },
              seasons: { type: 'array', items: { type: 'string', enum: [...SEASONS] } },
              notes: { type: 'string', description: 'e.g. retailer and order number' },
              tags: { type: 'array', items: { type: 'string' } },
              imageUrl: { type: 'string', description: 'https URL of the product image from the email' },
            },
            required: ['name', 'category'],
          },
        },
      },
      required: ['sourceId', 'items'],
    },
  },
  {
    name: 'add_grocery_receipt',
    description:
      'Save a grocery or supermarket receipt (a PDF or photo the user gave you, or an e-receipt email) in the food log: where it was bought, when, and every line with what it cost. One call per receipt. Pass sourceId = the receipt\'s unique number (for a Croatian fiscal receipt the JIR, otherwise the email message id or the receipt number) so the same receipt is never added twice. Clean up abbreviated names ("NAP ZOB 3,5% MA NO M" becomes "Oat milk 3.5%") and keep the printed text in rawName. For each line give quantity, unit (pc, or kg/l for weighed or poured goods) and unitPrice = the price the shop actually charged per unit, as printed on the receipt line: the line amount divided by the quantity, so quantity × unitPrice equals the printed line amount and the lines add up to the total. A discount shown on its own line (POPUST, loyalty-card discount) is usually already inside the printed line amount; check that the lines still add up to the total. If they do, put the amount in discount as a positive number (it is only what was saved, never subtracted again) and keep unitPrice as printed. If the lines only add up to the total after subtracting the discount, fold it into that line\'s unitPrice instead. Set kind: food, alcohol (beer, wine, cider, spirits), deposit (bottle/can return fees, POV.NAKNADA) or bag. Deposit lines marked "included" (UKLJUČ. POV.NAKNADA) are already inside the product prices: do NOT add them as lines, mention them in notes. Add deposit lines only when they are charged on top. Give each food and drink line a productType, storage and shelfLifeDays too (and trackAmount false for spices, oil and sauces) (they create the product the first time it is seen and are ignored afterwards); the same abbreviation at the same store is matched to the product named earlier, so keep rawName exactly as printed. Include every other line on the receipt, bags too, and pass the printed total so the result can tell you if a line was misread. Receipts are never edited afterwards from here.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'Unique receipt number (e.g. JIR) or email message id' },
        store: { type: 'string', description: 'Chain, e.g. "Konzum"' },
        branch: { type: 'string', description: 'Branch or address' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM, 24 hour' },
        total: { type: 'number', minimum: 0, description: 'Total printed on the receipt, including deposits' },
        notes: { type: 'string' },
        lines: {
          type: 'array',
          minItems: 1,
          maxItems: 120,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Cleaned-up product name' },
              rawName: { type: 'string', description: 'Name as printed on the receipt' },
              kind: { type: 'string', enum: [...LINE_KINDS] },
              quantity: { type: 'number', exclusiveMinimum: 0, description: 'Pieces, or kg/l for weighed lines' },
              unit: { type: 'string', enum: [...UNITS] },
              unitPrice: { type: 'number', minimum: 0, description: 'Price charged per unit as printed (line amount ÷ quantity); a discount is already inside it' },
              discount: { type: 'number', minimum: 0, description: 'Amount saved on this line, positive. Informational only: already included in unitPrice, never subtracted' },
              productType: { type: 'string', enum: [...PRODUCT_TYPES], description: 'How it is tracked in the inventory: fresh (goes off: meat, vegetables, dairy), staple (pasta, oat drink, hummus), drink (beer, wine, juice) or snack (chips, sweets). Only used the first time this product is seen.' },
              storage: { type: 'string', enum: [...STORAGES], description: 'Where it is kept. Only used the first time this product is seen.' },
              shelfLifeDays: { type: 'integer', minimum: 1, description: 'Typical days it keeps once bought (e.g. chicken fillet 2, carrots 14). Only used the first time this product is seen.' },
              trackAmount: { type: 'boolean', description: 'Pass false for things nobody can count or measure in a useful way: spices, salt, oil, vinegar, sauces. They are then only "have it" or "out" and a use never lowers them. Only used the first time this product is seen.' },
            },
            required: ['name', 'quantity', 'unitPrice'],
          },
        },
      },
      required: ['sourceId', 'store', 'date', 'lines'],
    },
  },
  {
    name: 'list_stock',
    description:
      'What is in the kitchen: every product that has been bought, with how much is left (in its unit: pieces, kg or l; a fraction like 1.5 means one pack and a half; spices and the like have no amount, only "have it" or out), where it is kept, the use-by date for fresh items and a status (ok, use-soon, check = probably past its date, low, out). Stock is worked out from the grocery receipts minus what was used, thrown away or counted. Use it to answer "do I have X?", "what should I eat soon?" or "what can I cook?", and to find the right product name before use_stock or count_stock. Items that are out are left out unless includeOut is true.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words that must all match the product name, e.g. "oat". Empty lists everything.' },
        storage: { type: 'string', enum: [...STORAGES] },
        status: { type: 'string', enum: ['ok', 'use-soon', 'check', 'low', 'out'] },
        includeOut: { type: 'boolean', description: 'Also list products that are all used up.' },
      },
    },
  },
  {
    name: 'use_stock',
    description:
      'Record that some of a product was used up (eaten, cooked with, drunk), that it is all finished, or that it was thrown away. Resolve the product with list_stock first when the name is not exact. action "use" takes quantity (default 1, in the product\'s unit: pieces, kg or l); "some_left" is for when only part was used and the user says how much is LEFT of the pack in use ("about half the hummus is left" = fractionLeft 0.5, "a quarter" = 0.25, "almost gone" = 0.1; for pieces it is the opened pack, the unopened ones stay whole; for kg/l it is a fraction of what there was); "finish" means none is left; "toss" means the rest was thrown away (it is kept as food waste). Only record what the user says happened; never guess. If the product is ambiguous the call fails and lists the candidates: ask the user which one. For products with no amount (spices, oil), "use" is only logged and the product stays in stock until "finish". The record is a new event; nothing existing is changed.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name or the words the user used, e.g. "hummus"' },
        action: { type: 'string', enum: ['use', 'some_left', 'finish', 'toss'], description: 'Default "use".' },
        fractionLeft: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1, description: 'For action "some_left": how much of the pack in use is left, e.g. 0.5.' },
        quantity: { type: 'number', exclusiveMinimum: 0, description: 'How much was used (action "use"). Default 1.' },
        date: { type: 'string', description: 'YYYY-MM-DD, default today.' },
        note: { type: 'string' },
      },
      required: ['product'],
    },
  },
  {
    name: 'count_stock',
    description:
      'Set how much of a product there really is, e.g. "I have 3 beers left" or after checking the fridge. This replaces what the stock was worked out to be from that day on. Use 0 for none left. Only when the user tells you the number.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name or the words the user used' },
        quantity: { type: 'number', minimum: 0 },
        date: { type: 'string', description: 'YYYY-MM-DD, default today.' },
      },
      required: ['product', 'quantity'],
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
  {
    name: 'edit_outfit',
    description:
      'Change an existing outfit: rename it and/or add or remove pieces. Resolve ids with list_outfits / find_items first. Only edit when the user asks; past wears are kept as they are. An outfit must keep at least one piece. The change shows up in the app the next time it syncs.',
    inputSchema: {
      type: 'object',
      properties: {
        outfitId: { type: 'string' },
        name: { type: 'string', description: 'New name.' },
        addItemIds: { type: 'array', items: { type: 'string' } },
        removeItemIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['outfitId'],
    },
  },
  {
    name: 'edit_item',
    description:
      'Change fields of an existing wardrobe item (name, category, brand, colours, size, material, price, purchase date, seasons, status, condition, notes). Only edit when the user asks, and only the fields they mention. Pass null for an optional field to clear it. Wear history, photos and tags are never changed here (use add_tags for tags). To retire an item set status (donated / sold / discarded) rather than deleting, but ONLY when the user says they actually got rid of it, with confirmRetire=true: never retire an item to replace it with a new one (that would split its wear history; to add a photo use set_item_photo). The change shows up in the app the next time it syncs.',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string' },
        name: { type: 'string' },
        category: { type: 'string', enum: [...CATEGORIES] },
        subcategory: { type: ['string', 'null'] },
        brand: { type: ['string', 'null'] },
        colors: { type: ['array', 'null'], items: { type: 'string', enum: [...PALETTE] }, maxItems: 5 },
        size: { type: ['string', 'null'] },
        material: { type: ['string', 'null'] },
        price: { type: ['number', 'null'], minimum: 0 },
        purchaseDate: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        seasons: { type: 'array', items: { type: 'string', enum: [...SEASONS] } },
        status: { type: 'string', enum: [...STATUSES] },
        confirmRetire: { type: 'boolean', description: 'Required when status is donated, sold or discarded: true only if the user said they got rid of the item.' },
        condition: { type: ['string', 'null'], enum: [...CONDITIONS, null] },
        notes: { type: ['string', 'null'] },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'set_item_photo',
    description:
      'Give an EXISTING wardrobe item a photo (or replace its photo) from an image URL, e.g. a product image from a receipt email. Use this, not add_item or add_receipt_items, whenever an item already exists and only its photo is missing or wrong, so it keeps its wear history. Typical source: the shop’s shipping or delivery email for the same order, when the order confirmation had no product image. The image must be a public https URL (jpeg, png, webp or avif, under about 700 KB). The photo appears in the app the next time it syncs.',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string' },
        imageUrl: { type: 'string', description: 'https URL of the image' },
      },
      required: ['itemId', 'imageUrl'],
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
    case 'add_tags':
      return ctx.readOnly ? fail(READ_ONLY) : addTags(args, ctx);
    case 'add_item':
      return ctx.readOnly ? fail(READ_ONLY) : addItem(args, ctx);
    case 'add_receipt_items':
      return ctx.readOnly ? fail(READ_ONLY) : addReceiptItems(args, ctx);
    case 'add_grocery_receipt':
      return ctx.readOnly ? fail(READ_ONLY) : addGroceryReceipt(args, ctx);
    case 'list_stock':
      return listStock(args, ctx);
    case 'use_stock':
      return ctx.readOnly ? fail(READ_ONLY) : useStock(args, ctx);
    case 'count_stock':
      return ctx.readOnly ? fail(READ_ONLY) : countStock(args, ctx);
    case 'create_outfit':
      return ctx.readOnly ? fail(READ_ONLY) : createOutfit(args, ctx);
    case 'edit_outfit':
      return ctx.readOnly ? fail(READ_ONLY) : editOutfit(args, ctx);
    case 'set_item_photo':
      return ctx.readOnly ? fail(READ_ONLY) : setItemPhoto(args, ctx);
    case 'edit_item':
      return ctx.readOnly ? fail(READ_ONLY) : editItem(args, ctx);
    default:
      return fail(`Unknown tool: ${name}`);
  }
}

const READ_ONLY = 'This deployment is read-only.';
const RETIRED = ['donated', 'sold', 'discarded'];
const NO_IMAGE =
  'No image URL was given. Order confirmations often have none: search Gmail for the other emails about this same order (the shop\'s shipping, dispatch or delivery notification, matching order number or items), take the product image URL from there, and call set_item_photo with this item id. Don\'t create the item again.';
const PHOTO_FAILED = 'Could not download that image. It must be a public https URL to a jpeg, png, webp or avif under about 700 KB; try another image URL from the email.';

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
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
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

function colorList(r: Row): string[] {
  return itemColors({ colors: Array.isArray(r.colors) ? strings(r.colors) : undefined, color: typeof r.color === 'string' ? r.color : undefined });
}

function itemSummary(r: Row) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    ...(r.brand ? { brand: r.brand } : {}),
    ...(colorList(r).length ? { colors: colorList(r) } : {}),
    ...(strings(r.tags).length ? { tags: strings(r.tags) } : {}),
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
    .filter((r) => matches([String(r.name ?? ''), String(r.brand ?? ''), String(r.color ?? ''), String(r.category ?? ''), String(r.subcategory ?? ''), ...strings(r.tags)], query))
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
      ...(strings(o.tags).length ? { tags: strings(o.tags) } : {}),
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

async function showPhotos(args: Args, { store, appUrl }: ToolContext): Promise<ToolResult> {
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
  // Tappable links into the app, for clients that can't display the photos inline.
  const links = [
    ...[...new Set(strings(args.outfitIds))].map((id) => `${outfitById.get(id)?.name ?? 'Outfit'}: ${appUrl}/#/clothes/outfits/${id}`),
    ...ids.map((id) => `${itemName.get(id)}: ${appUrl}/#/clothes/${id}`),
  ];
  const more = wanted.size > ids.length ? ` ${wanted.size - ids.length} more not shown (limit ${MAX_PHOTOS}).` : '';
  const missing = without.length ? ` No photo for: ${without.join(', ')}.` : '';
  const linkText = links.length ? `\nOpen in the app:\n${links.join('\n')}` : '';
  return {
    text: `Showing ${images.length} photo${images.length === 1 ? '' : 's'}.${missing}${more}${linkText}`,
    images,
    // The gallery reads the photos from here: hosts may strip image blocks from what they forward to the view.
    structured: { photos: images, note: `${missing}${more}`.trim() },
  };
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

async function addTags(args: Args, { store, now, newId }: ToolContext): Promise<ToolResult> {
  const tags = [
    ...new Set(
      strings(args.tags)
        .map((t) => t.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, 30))
        .filter(Boolean),
    ),
  ];
  if (tags.length === 0) return fail('Give at least one tag.');
  if (tags.length > 5) return fail('At most 5 tags per call.');
  const itemIds = [...new Set(strings(args.itemIds))];
  const outfitIds = [...new Set(strings(args.outfitIds))];
  if (itemIds.length + outfitIds.length === 0) return fail('Give at least one item id or outfit id.');
  if (itemIds.length + outfitIds.length > MAX_IDS) return fail(`At most ${MAX_IDS} ids per call.`);

  const [items, outfits] = await Promise.all([store.list('clothes'), store.list('outfits')]);
  const itemById = new Map(items.map((r) => [r.id, r]));
  const outfitById = new Map(outfits.map((r) => [r.id, r]));
  const unknown = [...itemIds.filter((id) => !itemById.has(id)), ...outfitIds.filter((id) => !outfitById.has(id))];
  if (unknown.length) return fail(`Unknown ids: ${unknown.join(', ')}.`);

  const stamp = now.toISOString();
  const request: TagRequest = { id: newId(), type: 'tags', tags, itemIds, outfitIds, source: 'claude', createdAt: stamp, updatedAt: stamp };
  await store.put('inbox', request.id, request);
  const names = [...outfitIds.map((id) => outfitById.get(id)!), ...itemIds.map((id) => itemById.get(id)!)].map((r) => String(r.name ?? '(unnamed outfit)'));
  return ok(`Queued tags [${tags.join(', ')}] for: ${names.join(', ')}. They appear in the app the next time it syncs.`);
}

async function addItem(args: Args, { store, now, newId, fetchPhoto: download = fetchPhoto }: ToolContext): Promise<ToolResult> {
  const name = text(args.name);
  if (!name) return fail('name is required.');
  if (!(CATEGORIES as readonly string[]).includes(args.category as string)) return fail(`category must be one of: ${CATEGORIES.join(', ')}.`);
  if (args.purchaseDate !== undefined && !isRealDate(args.purchaseDate)) return fail('purchaseDate must be YYYY-MM-DD.');
  if (args.price !== undefined && !(typeof args.price === 'number' && args.price >= 0)) return fail('price must be a non-negative number.');

  if (args.allowDuplicate !== true) {
    const same = findDuplicate(await store.list('clothes'), name, text(args.brand));
    if (same) {
      return fail(
        `Not added: “${same.name}” (id ${same.id}) already exists. Use edit_item to change its fields or set_item_photo to give it a photo; never create a new item or retire the old one to replace it, because that splits its wear history. If the user confirms it is really a second one, call again with allowDuplicate=true.`,
      );
    }
  }
  const imageUrl = typeof args.imageUrl === 'string' && args.imageUrl.startsWith('https://') ? args.imageUrl : undefined;
  const photo = imageUrl ? await download(imageUrl) : undefined;

  const stamp = now.toISOString();
  const colors = [...new Set(strings(args.colors))];
  if (colors.some((c) => !PALETTE.includes(c))) return fail(`colors must be from: ${PALETTE.join(', ')}.`);
  const tags = strings(args.tags).map((t) => t.trim().slice(0, 50)).filter(Boolean).slice(0, 20);
  const item = {
    id: newId(),
    name,
    category: args.category,
    subcategory: text(args.subcategory, 50),
    brand: text(args.brand),
    colors: colors.length ? colors : undefined,
    color: colors.length ? colors.join(', ') : undefined,
    size: text(args.size, 50),
    material: text(args.material),
    price: args.price,
    purchaseDate: args.purchaseDate,
    notes: text(args.notes, 1000),
    tags: tags.length ? tags : undefined,
    seasons: strings(args.seasons).filter((s) => (SEASONS as readonly string[]).includes(s)),
    status: 'active',
    photo,
    wears: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  await store.put('clothes', item.id, item);
  return ok({ added: { id: item.id, name, ...(imageUrl ? { photo: !!photo, ...(photo ? {} : { photoNote: PHOTO_FAILED }) } : {}) } });
}

async function addReceiptItems(args: Args, { store, now, fetchPhoto: download = fetchPhoto }: ToolContext): Promise<ToolResult> {
  const sourceId = text(args.sourceId, 100)?.replace(/[^A-Za-z0-9_-]/g, '');
  if (!sourceId) return fail('sourceId is required (the email message id).');
  const lines = parseReceiptLines(args.items, utcToday(now));
  if (lines.length === 0) return fail('No valid items. Each needs a name and a category.');

  // Ids come from the email, so adding the same receipt again changes nothing (and never overwrites edits).
  const rows = await store.list('clothes');
  const known = new Set(rows.map((r) => r.id));
  const added: { id: string; name: string; photo: boolean; photoNote?: string }[] = [];
  const duplicates: { line: string; existingItemId: string; existingName: string }[] = [];
  for (const [i, line] of lines.entries()) {
    const id = `receipt-${sourceId}-${i}`;
    if (known.has(id)) continue;
    // An existing item that looks the same is the owner's, with its wear history: don't create a second one.
    const same = args.allowDuplicates === true ? undefined : findDuplicate(rows, line.name, line.brand);
    if (same) {
      duplicates.push({ line: line.name, existingItemId: same.id, existingName: String(same.name) });
      continue;
    }
    const photo = line.imageUrl ? await download(line.imageUrl) : undefined;
    await store.put('clothes', id, receiptItem(line, id, photo, now));
    rows.push({ id, name: line.name, brand: line.brand, status: 'active' });
    added.push({ id, name: line.name, photo: !!photo, ...(photo ? {} : { photoNote: line.imageUrl ? PHOTO_FAILED : NO_IMAGE }) });
  }
  if (!added.length && !duplicates.length) return ok({ alreadyAdded: true });
  return ok({
    ...(added.length ? { added, note: 'Flagged "needs review" in the app.' } : {}),
    ...(duplicates.length
      ? {
          skippedAsExisting: duplicates,
          duplicatesNote:
            'These already exist, so nothing was created for them. If one needs a photo use set_item_photo; to change fields use edit_item. Never retire the old item. Only call again with allowDuplicates=true if the user confirms they bought another one.',
        }
      : {}),
  });
}

async function setItemPhoto(args: Args, { store, now, newId, fetchPhoto: download = fetchPhoto }: ToolContext): Promise<ToolResult> {
  const itemId = text(args.itemId);
  if (!itemId) return fail('itemId is required.');
  const url = text(args.imageUrl, 2000);
  if (!url || !url.startsWith('https://')) return fail('imageUrl must be an https URL.');
  const item = (await store.list('clothes')).find((r) => r.id === itemId);
  if (!item) return fail(`Unknown item id: ${itemId}. Look it up with find_items.`);

  const photo = await download(url);
  if (!photo) return fail(PHOTO_FAILED);

  // Applied by the app like other edits, so the item itself is never overwritten from here.
  const stamp = now.toISOString();
  const request: PhotoRequest = { id: newId(), type: 'photo', itemIds: [itemId], outfitIds: [], photo, source: 'claude', createdAt: stamp, updatedAt: stamp };
  await store.put('inbox', request.id, request);
  return ok(`Queued a new photo for “${item.name}”. It is only applied when the app next syncs, so tell the user it is queued, not already attached; nothing else about the item changes.`);
}

async function addGroceryReceipt(args: Args, { store, now }: ToolContext): Promise<ToolResult> {
  const sourceId = text(args.sourceId, 100)?.replace(/[^A-Za-z0-9_-]/g, '');
  if (!sourceId) return fail('sourceId is required (the receipt number or email message id).');
  const parsed = parseGroceryReceipt(args, utcToday(now));
  if (!parsed) return fail('A store and at least one line (name, quantity, unitPrice) are required.');

  // The id comes from the receipt, so adding it again changes nothing.
  const id = `food-${sourceId}`;
  const earlier = (await store.list('foodreceipts')) as unknown as (FoodReceipt & Row)[];
  if (earlier.some((r) => r.id === id)) return ok({ alreadyAdded: true });

  // Printed text seen before at this store keeps the name it was given then, so it stays the same product.
  const { receipt, hints, mismatch } = parsed;
  const renamed: { from: string; to: string }[] = [];
  const lines = receipt.lines.map((l) => {
    const name = canonicalName(receipt.store, l.rawName, l.name, earlier);
    if (name !== l.name) renamed.push({ from: l.name, to: name });
    return { ...l, name };
  });

  // New products get a record with what Claude knows; existing ones are never touched.
  const known = new Set((await store.list('foodproducts')).map((r) => r.id));
  const stamp = now.toISOString();
  const created: string[] = [];
  for (const [i, l] of lines.entries()) {
    const pid = productId(l.name);
    if (!isStocked(l.kind) || known.has(pid)) continue;
    known.add(pid);
    const type = hints[i]?.type ?? defaultType(l.kind, l.unit);
    const product: FoodProduct = { id: pid, name: l.name, type, storage: hints[i]?.storage ?? defaultStorage(type), shelfLifeDays: hints[i]?.shelfLifeDays, ...(hints[i]?.trackAmount === false ? { trackAmount: false } : {}), createdAt: stamp, updatedAt: stamp };
    await store.put('foodproducts', pid, product);
    created.push(l.name);
  }

  await store.put('foodreceipts', id, { id, ...receipt, lines, createdAt: stamp, updatedAt: stamp });
  return ok({
    added: id,
    lines: lines.length,
    summedFromLines: mismatch?.summed ?? receipt.total,
    ...(created.length ? { newProducts: created } : {}),
    ...(renamed.length ? { matchedToKnownProducts: renamed } : {}),
    ...(mismatch
      ? {
          warning: `The printed total (${mismatch.printed}) does not match the lines (${mismatch.summed}). A line was probably misread or missing: check the receipt again and tell the user.`,
        }
      : {}),
  });
}

// ---- food stock ----

/** Everything the stock tools need: the products on receipts, their events, and the date. */
async function stockState(store: RecordStore, now: Date) {
  const receipts = (await store.list('foodreceipts')) as unknown as FoodReceipt[];
  const records = (await store.list('foodproducts')) as unknown as FoodProduct[];
  const events = (await store.list('foodstock')) as unknown as StockEvent[];
  const today = utcToday(now);
  const products = productSummaries(receipts, records);
  const stockFor = (p: ProductSummary): Stock =>
    stockOf(p, p.purchases, events.filter((e) => e.productId === p.id), today);
  return { products, events, today, stockFor };
}

function describeProduct(p: ProductSummary, s: Stock) {
  return {
    name: p.name,
    ...(s.tracked
      ? { quantity: s.quantity, unit: p.unit === 'pc' ? 'pieces' : p.unit }
      : { tracking: 'have it or out (no amount)', have: s.quantity > 0 }),
    type: p.type,
    storage: p.storage,
    status: s.status,
    ...(s.useBy ? { useBy: s.useBy } : {}),
    ...(s.lastConfirmed ? { lastBoughtOrCounted: s.lastConfirmed } : {}),
  };
}

async function listStock(args: Args, { store, now }: ToolContext): Promise<ToolResult> {
  const { products, stockFor } = await stockState(store, now);
  const words = normalizeKey(text(args.query) ?? '').split(' ').filter(Boolean);
  const storage = text(args.storage);
  const status = text(args.status);
  const rows = products
    .filter((p) => words.every((w) => normalizeKey(p.name).split(' ').some((x) => x.startsWith(w))))
    .filter((p) => !storage || p.storage === storage)
    .map((p) => ({ p, s: stockFor(p) }))
    .filter(({ s }) => (status ? s.status === status : args.includeOut === true || s.status !== 'out'));
  if (rows.length === 0) return ok('Nothing matches. Stock only covers products that were bought and saved from a receipt.');
  return ok(rows.map(({ p, s }) => describeProduct(p, s)));
}

/** The one product the user means, or a failure that lists the candidates. */
function resolveProduct(query: unknown, products: ProductSummary[]): { product: ProductSummary } | { error: ToolResult } {
  const q = text(query);
  if (!q) return { error: fail('product is required.') };
  const exact = products.find((p) => p.id === productId(q));
  if (exact) return { product: exact };
  const words = normalizeKey(q).split(' ').filter(Boolean);
  const hits = products.filter((p) => words.every((w) => normalizeKey(p.name).split(' ').some((x) => x.startsWith(w))));
  if (hits.length === 1) return { product: hits[0] };
  if (hits.length === 0) return { error: fail(`No product matches "${q}". Check the name with list_stock (includeOut=true shows everything that was ever bought).`) };
  return { error: fail(`"${q}" matches several products: ${hits.map((p) => `"${p.name}"`).join(', ')}. Ask the user which one, then call again with the exact name.`) };
}

function eventDate(v: unknown, fallback: string): string | undefined {
  return v === undefined ? fallback : isRealDate(v) ? v : undefined;
}

async function useStock(args: Args, { store, now, newId }: ToolContext): Promise<ToolResult> {
  const { products, events, today, stockFor } = await stockState(store, now);
  const found = resolveProduct(args.product, products);
  if ('error' in found) return found.error;
  const p = found.product;
  const date = eventDate(args.date, today);
  if (!date) return fail('date must be YYYY-MM-DD.');
  const action = args.action === 'finish' || args.action === 'toss' || args.action === 'some_left' ? args.action : 'use';
  const stockBefore = stockFor(p);
  const before = stockBefore.quantity;
  const untracked = !stockBefore.tracked;

  let type: StockEvent['type'];
  let quantity: number;
  if (action === 'finish') {
    type = 'count';
    quantity = 0;
  } else if (action === 'toss') {
    if (before <= 0) return fail(`None of "${p.name}" is in stock, so there is nothing to throw away.`);
    type = 'toss';
    quantity = before;
  } else if (action === 'some_left') {
    if (untracked) return fail(`"${p.name}" is tracked as have it or out, so it has no amount to lower. Use action "use" to log a use, or "finish" when it is all gone.`);
    const f = args.fractionLeft;
    if (typeof f !== 'number' || !Number.isFinite(f) || f <= 0 || f >= 1) return fail('fractionLeft must be between 0 and 1, e.g. 0.5 for half left. Use action "finish" when none is left.');
    if (before <= 0) return fail(`None of "${p.name}" is in stock, so nothing can be partly used. Use count_stock if the user says they have some.`);
    const used = Math.round((before - partLeft(before, p.unit, f)) * 1000) / 1000;
    if (used <= 0) return fail(`"${p.name}" is already at or below that level (${formatQty(before)} ${p.unit === 'pc' ? 'pieces' : p.unit} in stock). Use count_stock if the user says otherwise.`);
    type = 'use';
    quantity = used;
  } else {
    const q = args.quantity === undefined ? 1 : args.quantity;
    if (typeof q !== 'number' || !Number.isFinite(q) || q <= 0 || q > 10_000) return fail('quantity must be a positive number.');
    type = 'use';
    quantity = untracked ? 1 : Math.round(q * 1000) / 1000;
  }

  const stamp = now.toISOString();
  const event: StockEvent = { id: newId(), productId: p.id, type, quantity, date, source: 'claude', note: text(args.note, 500), createdAt: stamp, updatedAt: stamp };
  await store.put('foodstock', event.id, event);
  const left = stockOf(p, p.purchases, [...events.filter((e) => e.productId === p.id), event], today);
  if (untracked) {
    return ok({
      recorded: action,
      product: p.name,
      have: left.quantity > 0,
      ...(action === 'use' ? { note: 'Tracked as have it or out: this use is logged but the product stays in stock until it is finished.' } : {}),
    });
  }
  return ok({
    recorded: action,
    product: p.name,
    ...(action === 'use' || action === 'some_left' ? { used: formatQty(quantity) } : {}),
    left: left.quantity,
    unit: p.unit === 'pc' ? 'pieces' : p.unit,
    ...(action === 'use' && quantity > before ? { note: `Only ${formatQty(before)} was thought to be in stock, so it now shows none left.` } : {}),
  });
}

async function countStock(args: Args, { store, now, newId }: ToolContext): Promise<ToolResult> {
  const { products, today } = await stockState(store, now);
  const found = resolveProduct(args.product, products);
  if ('error' in found) return found.error;
  const p = found.product;
  const q = args.quantity;
  if (typeof q !== 'number' || !Number.isFinite(q) || q < 0 || q > 10_000) return fail('quantity must be a number, 0 or more.');
  const date = eventDate(args.date, today);
  if (!date) return fail('date must be YYYY-MM-DD.');
  const stamp = now.toISOString();
  const event: StockEvent = { id: newId(), productId: p.id, type: 'count', quantity: Math.round(q * 1000) / 1000, date, source: 'claude', createdAt: stamp, updatedAt: stamp };
  await store.put('foodstock', event.id, event);
  const untracked = p.trackAmount === false;
  return ok(untracked ? { counted: p.name, have: event.quantity > 0 } : { counted: p.name, quantity: event.quantity, unit: p.unit === 'pc' ? 'pieces' : p.unit });
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

async function editOutfit(args: Args, { store, now, newId }: ToolContext): Promise<ToolResult> {
  const outfitId = text(args.outfitId);
  const name = text(args.name);
  const addItemIds = [...new Set(strings(args.addItemIds))];
  const removeItemIds = [...new Set(strings(args.removeItemIds))];
  if (!outfitId) return fail('outfitId is required.');
  if (!name && addItemIds.length + removeItemIds.length === 0) return fail('Give a new name and/or items to add or remove.');
  if (addItemIds.length + removeItemIds.length > MAX_IDS) return fail(`At most ${MAX_IDS} ids per call.`);
  if (addItemIds.some((id) => removeItemIds.includes(id))) return fail('An item can’t be both added and removed.');

  const [items, outfits] = await Promise.all([store.list('clothes'), store.list('outfits')]);
  const outfit = outfits.find((o) => o.id === outfitId);
  if (!outfit) return fail(`Unknown outfit id: ${outfitId}. Look it up with list_outfits.`);
  const known = new Set(items.map((r) => r.id));
  const unknown = addItemIds.filter((id) => !known.has(id));
  if (unknown.length) return fail(`Unknown item ids: ${unknown.join(', ')}.`);

  const result = [...new Set([...strings(outfit.itemIds), ...addItemIds])].filter((id) => !removeItemIds.includes(id));
  if (result.length === 0) return fail('An outfit needs at least one piece. Add items in the same call, or leave some in place.');

  const stamp = now.toISOString();
  const request: OutfitEditRequest = {
    id: newId(),
    type: 'outfit-edit',
    outfitIds: [outfitId],
    itemIds: addItemIds,
    removeItemIds,
    ...(name ? { name } : {}),
    source: 'claude',
    createdAt: stamp,
    updatedAt: stamp,
  };
  await store.put('inbox', request.id, request);
  const names = new Map(items.map((r) => [r.id, String(r.name)]));
  const pieces = result.map((id) => names.get(id) ?? '(deleted item)').join(', ');
  return ok(`Queued an edit to “${outfit.name ?? 'unnamed outfit'}”${name ? ` (new name “${name}”)` : ''}. Pieces will be: ${pieces}. It appears in the app the next time it syncs.`);
}

const CLEARABLE_TEXT = { subcategory: 50, brand: 200, size: 50, material: 200, notes: 1000 } as const;

async function editItem(args: Args, { store, now, newId }: ToolContext): Promise<ToolResult> {
  const itemId = text(args.itemId);
  if (!itemId) return fail('itemId is required.');
  const changes: ItemChanges = {};

  if (args.name !== undefined) {
    const name = text(args.name);
    if (!name) return fail('name can’t be empty.');
    changes.name = name;
  }
  if (args.category !== undefined) {
    if (!(CATEGORIES as readonly string[]).includes(args.category as string)) return fail(`category must be one of: ${CATEGORIES.join(', ')}.`);
    changes.category = args.category as string;
  }
  if (args.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(args.status as string)) return fail(`status must be one of: ${STATUSES.join(', ')}.`);
    changes.status = args.status as string;
    if (RETIRED.includes(changes.status) && args.confirmRetire !== true) {
      return fail(
        `Not retired. Only set status “${changes.status}” when the user said they actually got rid of this item, and then pass confirmRetire=true. Never retire an item to replace it with a new one: that splits its wear history (use set_item_photo or edit_item on the existing item).`,
      );
    }
  }
  if (args.condition !== undefined) {
    if (args.condition !== null && !(CONDITIONS as readonly string[]).includes(args.condition as string)) return fail(`condition must be null or one of: ${CONDITIONS.join(', ')}.`);
    changes.condition = args.condition as string | null;
  }
  for (const [field, max] of Object.entries(CLEARABLE_TEXT) as [keyof typeof CLEARABLE_TEXT, number][]) {
    if (args[field] === undefined) continue;
    if (args[field] !== null && typeof args[field] !== 'string') return fail(`${field} must be a string or null.`);
    changes[field] = args[field] === null ? null : (text(args[field], max) ?? null);
  }
  if (args.price !== undefined) {
    if (args.price !== null && !(typeof args.price === 'number' && args.price >= 0)) return fail('price must be a non-negative number or null.');
    changes.price = args.price as number | null;
  }
  if (args.purchaseDate !== undefined) {
    if (args.purchaseDate !== null && !isRealDate(args.purchaseDate)) return fail('purchaseDate must be YYYY-MM-DD or null.');
    changes.purchaseDate = args.purchaseDate as string | null;
  }
  if (args.colors !== undefined) {
    const colors = args.colors === null ? null : [...new Set(strings(args.colors))];
    if (colors && (colors.length > 5 || colors.some((c) => !PALETTE.includes(c)))) return fail(`colors must be at most 5 from: ${PALETTE.join(', ')}.`);
    changes.colors = colors;
  }
  if (args.seasons !== undefined) {
    const seasons = strings(args.seasons);
    if (seasons.some((s) => !(SEASONS as readonly string[]).includes(s))) return fail(`seasons must be from: ${SEASONS.join(', ')}.`);
    changes.seasons = [...new Set(seasons)];
  }
  if (Object.keys(changes).length === 0) return fail('Give at least one field to change.');

  const item = (await store.list('clothes')).find((r) => r.id === itemId);
  if (!item) return fail(`Unknown item id: ${itemId}. Look it up with find_items.`);

  const stamp = now.toISOString();
  const request: ItemEditRequest = { id: newId(), type: 'item-edit', itemIds: [itemId], outfitIds: [], changes, source: 'claude', createdAt: stamp, updatedAt: stamp };
  await store.put('inbox', request.id, request);
  return ok(`Queued an edit to “${item.name}”: ${Object.keys(changes).join(', ')}. It appears in the app the next time it syncs.`);
}
