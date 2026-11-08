// Tools exposed to Claude over MCP (see mcp.ts). Reads come straight from D1;
// logging a wear goes through the `inbox` store so the app applies it with its
// own wear logic. New items and outfits have fresh ids, so they can be written
// directly without risking a clobbered edit.

import { PALETTE, itemColors } from '../src/modules/clothes/colors';
import { LINE_KINDS, PRODUCT_TYPES, STORAGES, UNITS } from '../src/modules/food/types';
import { CATEGORIES, CONDITIONS, SEASONS, STATUSES } from '../src/modules/clothes/types';
import type { ItemChanges, ItemEditRequest, OutfitEditRequest, PhotoRequest, ProductEditRequest, TagRequest, WearRequest } from './protocol';
import { PHOTOS_URI } from './photosView';
import { canonicalName, defaultStorage, defaultType, isStocked, normalizeKey, pluralize, productId, productSummaries, type ProductSummary } from '../src/modules/food/products';
import { parseProductChanges, withProductChanges } from '../src/modules/food/productEdits';
import { comparePrices, offerShare, priceUnit } from '../src/modules/food/prices';
import { REASON_LABELS, shoppingList } from '../src/modules/food/shopping';
import { formatQty, originBatch, partLeft, stockOf, type Batch, type Stock } from '../src/modules/food/stock';
import type { FoodProduct, FoodReceipt, StockEvent } from '../src/modules/food/types';
import { parseGroceryReceipt } from './groceries';
import { parseRides } from './rides';
import { parseWoltOrders } from './wolt';
import type { TakeoutService } from '../src/modules/wolt/types';
import type { PhotoSearchInput } from './foodPhotos';
import type { PhotoSearchResult } from './openfoodfacts';
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
  /** Looks pictures of packaged food up in Open Food Facts. Faked in tests. */
  searchPhotos?: (input: PhotoSearchInput) => Promise<PhotoSearchResult>;
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
      'Save a grocery or supermarket receipt (a PDF or photo the user gave you, or an e-receipt email) in the food log: where it was bought, when, and every line with what it cost. One call per receipt. Pass sourceId = the receipt\'s unique number (for a Croatian fiscal receipt the JIR, otherwise the email message id or the receipt number) so the same receipt is never added twice. Clean up abbreviated names ("NAP ZOB 3,5% MA NO M" becomes "Oat milk 3.5%") and keep the printed text in rawName. For each line give quantity, unit (pc, or kg/l for weighed or poured goods) and unitPrice = the price the shop actually charged per unit, as printed on the receipt line: the line amount divided by the quantity, so quantity × unitPrice equals the printed line amount and the lines add up to the total. A discount shown on its own line (POPUST, loyalty-card discount) is usually already inside the printed line amount; check that the lines still add up to the total. If they do, put the amount in discount as a positive number (it is only what was saved, never subtracted again) and keep unitPrice as printed. If the lines only add up to the total after subtracting the discount, fold it into that line\'s unitPrice instead. Set kind: food, alcohol (beer, wine, cider, spirits), household (shampoo, conditioner, hair masks, soap, toothpaste, cleaning products, from drugstores like dm: stocked like food and kept under Home, but not food, so it stays out of the food stats; give it productType staple, storage home and a long shelfLifeDays, and packSize for multipacks), other (anything else that is not stocked), deposit (bottle/can return fees, POV.NAKNADA) or bag. Deposit lines marked "included" (UKLJUČ. POV.NAKNADA) are already inside the product prices: do NOT add them as lines, mention them in notes. Add deposit lines only when they are charged on top. Give each food, drink and household line a productType, storage and shelfLifeDays too (trackAmount false for spices, oil and sauces; packSize and packLabel for multipacks such as a 6-pack of beer) (they create the product the first time it is seen and are ignored afterwards); the same abbreviation at the same store is matched to the product named earlier, so keep rawName exactly as printed. Include every other line on the receipt, bags too, and pass the printed total so the result can tell you if a line was misread. Receipts are never edited afterwards from here.',
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
              packSize: { type: 'integer', minimum: 2, maximum: 100, description: 'Items in one pack as bought, when the line is a multipack (6 for a 6-pack of beer, 4 for a 4-pack of yoghurt). Quantity stays the number of packs bought. Stock is then counted in single items. Only used the first time this product is seen.' },
              packLabel: { type: 'string', description: 'What one item in the pack is called, singular: "can", "bottle", "cup". Only used with packSize.' },
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
    name: 'add_wolt_orders',
    description:
      'Save Wolt TAKEOUT orders (restaurants, fast food, cafés: ready-made food) in the takeout log. Wolt also delivers groceries (Wolt Market and other shops, supermarkets, pharmacies): those are NOT takeout. Never put them here; add them with add_grocery_receipt instead (store = the shop, sourceId = the Wolt order id prefixed "wolt-", lines from the receipt PDF if you can read it), so they feed products and stock. If a Wolt email is unclear, ask the user which it is. Find the emails by searching Gmail for Wolt order/receipt emails (sender wolt.com), read each one and pass every order here, as many as you like per call. Per order give sourceId = a unique id for it (the Wolt order id or receipt number in the email, otherwise the email message id) so the same order is never added twice: adding again is safe and skips ones already saved. restaurant = the venue name as Wolt writes it, including the branch ("McDonald\'s - Rotor"), date = the day it was delivered (YYYY-MM-DD, local), time = HH:MM 24 hour, total = what was paid including delivery and tip as the email states it, currency = ISO code (EUR, or PLN for orders placed in Poland; do not convert). Item lines are only in the PDF attachment and are not tracked. Orders are never edited afterwards from here.',
    inputSchema: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              sourceId: { type: 'string', description: 'Wolt order id / receipt number, or the email message id' },
              restaurant: { type: 'string', description: 'Venue as Wolt names it, with the branch' },
              date: { type: 'string', description: 'YYYY-MM-DD' },
              time: { type: 'string', description: 'HH:MM, 24 hour' },
              total: { type: 'number', minimum: 0 },
              currency: { type: 'string', description: 'ISO code, default EUR' },
              city: { type: 'string' },
            },
            required: ['sourceId', 'restaurant', 'date', 'total'],
          },
        },
      },
      required: ['orders'],
    },
  },
  {
    name: 'add_takeout_orders',
    description:
      'Save Bolt Food or Uber Eats TAKEOUT orders (restaurants, fast food, cafés: ready-made food) in the takeout log, the same log Wolt orders go to (use add_wolt_orders for Wolt). Bolt and Uber also deliver groceries (shops, supermarkets): those are NOT takeout, add them with add_grocery_receipt instead. Bolt rides and Uber rides are not orders: skip them. Find the emails by searching Gmail (Bolt Food: sender bolt.eu; Uber Eats: sender uber.com, "Your order with ..."), read each one and pass every order here with `service` = "bolt" or "uber", as many as you like per call. Per order give sourceId = a unique id for it (the order id or receipt number in the email, otherwise the email message id) so the same order is never added twice: adding again is safe and skips ones already saved. restaurant = the venue name as the app writes it, date = the day it was delivered (YYYY-MM-DD, local), time = HH:MM 24 hour, total = what was paid including delivery and tip as the email states it, currency = ISO code (EUR by default; do not convert). Item lines are not tracked. Orders are never edited afterwards from here.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', enum: ['bolt', 'uber'], description: 'bolt = Bolt Food, uber = Uber Eats' },
        orders: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              sourceId: { type: 'string', description: 'Order id / receipt number, or the email message id' },
              restaurant: { type: 'string', description: 'Venue as the app names it, with the branch' },
              date: { type: 'string', description: 'YYYY-MM-DD' },
              time: { type: 'string', description: 'HH:MM, 24 hour' },
              total: { type: 'number', minimum: 0 },
              currency: { type: 'string', description: 'ISO code, default EUR' },
              city: { type: 'string' },
            },
            required: ['sourceId', 'restaurant', 'date', 'total'],
          },
        },
      },
      required: ['service', 'orders'],
    },
  },
  {
    name: 'add_rides',
    description:
      'Save Bolt and Uber taxi rides in the rides log. Find the receipts by searching Gmail for Bolt ("Your Bolt ride", sender bolt.eu) and Uber ("Your trip with Uber", sender uber.com) ride receipt emails, read each one and pass every ride here, as many as you like per call. Food deliveries (Uber Eats, Bolt Food) are NOT rides: skip them (Wolt-style takeout goes to add_wolt_orders). Per ride give provider = "bolt" or "uber", sourceId = a unique id for it (the trip/order id or receipt number in the email, otherwise the email message id) so the same ride is never added twice: adding again is safe and skips ones already saved. date and time = when the ride STARTED (pickup time, YYYY-MM-DD and HH:MM 24 hour, local), not when the email was sent; from and to = the pickup and drop-off addresses as printed; fare = what was paid in total including tip as the email states it; currency = ISO code (EUR by default; do not convert); distanceKm and durationMin if the receipt shows them; city if clear. Cancelled rides with no charge are skipped. Rides are never edited afterwards from here.',
    inputSchema: {
      type: 'object',
      properties: {
        rides: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['bolt', 'uber'] },
              sourceId: { type: 'string', description: 'Trip / order id or receipt number, or the email message id' },
              date: { type: 'string', description: 'YYYY-MM-DD, the day the ride started' },
              time: { type: 'string', description: 'HH:MM, 24 hour, pickup time' },
              from: { type: 'string', description: 'Pickup address as printed' },
              to: { type: 'string', description: 'Drop-off address as printed' },
              fare: { type: 'number', minimum: 0 },
              currency: { type: 'string', description: 'ISO code, default EUR' },
              distanceKm: { type: 'number', minimum: 0 },
              durationMin: { type: 'number', minimum: 0 },
              city: { type: 'string' },
            },
            required: ['provider', 'sourceId', 'date', 'fare'],
          },
        },
      },
      required: ['rides'],
    },
  },
  {
    name: 'list_stock',
    description:
      'What is in the kitchen: every product that has been bought, with how much is left (in its unit: pieces, kg or l; multipacks such as a 6-pack of beer are counted in single items, e.g. 11 cans; otherwise a fraction like 1.5 means one pack and a half; spices and the like have no amount, only "have it" or out), where it is kept, the use-by date for fresh items and a status (ok, use-soon, check = probably past its date, low, out). Stock is worked out from the grocery receipts minus what was used, thrown away or counted. Use it to answer "do I have X?", "what should I eat soon?" or "what can I cook?", and to find the right product name before use_stock or count_stock. Items that are out are left out unless includeOut is true.',
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
    name: 'shopping_list',
    description:
      'What to buy next: products that are out or running low, and products the user usually rebuys by now (based on how often they bought them before), each with the usual quantity and the cheapest store known for it with its shelf price per unit (kg, l or item), and how much that saves compared with the store they bought it at last. Worked out from the grocery receipts and stock, so it only knows products bought before. Use it to answer "what do I need from the shop?" or "where should I buy X?"; it changes nothing.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'product_prices',
    description:
      'What a food product costs at each store the user has bought it at (shelf price per kg, l or item, without offers; the last price paid when it was on offer; last visit and lowest price), and whether another store has been clearly cheaper than where it was bought last. Resolve the product by words in its name; if several match the call fails and lists them. Only prices from the last six months are compared. Changes nothing.',
    inputSchema: {
      type: 'object',
      properties: { product: { type: 'string', description: 'Words from the product name, e.g. "oat".' } },
      required: ['product'],
    },
  },
  {
    name: 'use_stock',
    description:
      'Record that some of a product was used up (eaten, cooked with, drunk), that it is all finished, or that it was thrown away. Resolve the product with list_stock first when the name is not exact. action "use" takes quantity (default 1, in the product\'s unit: pieces, kg or l, or single items for multipacks: "had two beers" = 2 cans); "some_left" is for when only part was used and the user says how much is LEFT of the pack in use ("about half the hummus is left" = fractionLeft 0.5, "a quarter" = 0.25, "almost gone" = 0.1; for pieces it is the opened pack, the unopened ones stay whole; for kg/l it is a fraction of what there was); "finish" means none is left; "toss" means the rest was thrown away (it is kept as food waste). "freeze" means some was put in the freezer (use-by moves to about three months on, say how much with quantity, otherwise all of it or of the batch) and "thaw" means some frozen food was taken out (use-by two days on; thawed food is never frozen again, so a freeze of it is refused: encourage using it); use boughtOn to name the purchase. Only record what the user says happened; never guess. If the product is ambiguous the call fails and lists the candidates: ask the user which one. For products with no amount (spices, oil), "use" is only logged and the product stays in stock until "finish". The record is a new event; nothing existing is changed.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name or the words the user used, e.g. "hummus"' },
        action: { type: 'string', enum: ['use', 'some_left', 'finish', 'toss', 'freeze', 'thaw'], description: 'Default "use". "freeze" puts quantity (default: all that is not frozen, or all of the batch) in the freezer, which extends its use-by to about three months; "thaw" takes quantity of what is frozen out, use-by two days on.' },
        notInStats: { type: 'boolean', description: 'True when the user is just catching up on something that happened earlier ("I already used that one", "threw that out last week"): the stock changes, but it is kept out of the statistics (waste, uses). Use it whenever the user says the thing did not happen today or should not count.' },
        boughtOn: { type: 'string', description: 'YYYY-MM-DD. Act on the batch bought on that day (see "batches" in list_stock) instead of whichever expires first: "threw out the chicken from Tuesday". With toss or finish it applies to that batch only.' },
        fractionLeft: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1, description: 'For action "some_left": how much of the pack in use is left, e.g. 0.5.' },
        quantity: { type: 'number', exclusiveMinimum: 0, description: 'How much was used (action "use"). Default 1.' },
        date: { type: 'string', description: 'YYYY-MM-DD, default today.' },
        dateUnknown: { type: 'boolean', description: 'With action "finish": it was used up at some unknown earlier time ("I already ate that chicken, no idea when"). Stores no date, so no stat treats it as a day it was used.' },
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
        notInStats: { type: 'boolean', description: 'True to keep this out of the statistics (see use_stock).' },
      },
      required: ['product', 'quantity'],
    },
  },
  {
    name: 'set_product_info',
    description:
      'Change how a food product is tracked: its pack size (items in one multipack, e.g. 6 for a 6-pack of beer, with packLabel "can"), type (fresh / staple / drink / snack), where it is kept, how many days it keeps, or trackAmount (false for spices, oil and sauces: only "have it or out"). Use it when the user tells you something about a product that is already in the app, e.g. "the Staropramen is a 6-pack of cans". Resolve the product with list_stock if the name is not exact. If the product has no settings yet the change applies at once; if it already has settings the change is queued and the app applies it the next time it syncs, so tell the user it is queued and do not log uses of that product in the meantime, because stock still counts with the old settings until then. Pack size and label only fit products sold in pieces. Only change what the user says; null clears packSize, packLabel or shelfLifeDays.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name or the words the user used' },
        packSize: { type: ['integer', 'null'], minimum: 2, maximum: 100, description: 'Items in one pack as bought' },
        packLabel: { type: ['string', 'null'], description: 'What one item is called, singular: "can", "bottle"' },
        type: { type: 'string', enum: [...PRODUCT_TYPES] },
        storage: { type: 'string', enum: [...STORAGES] },
        shelfLifeDays: { type: ['integer', 'null'], minimum: 1 },
        trackAmount: { type: 'boolean', description: 'false = only "have it or out" (spices, oil, sauces); true = count how many.' },
      },
      required: ['product'],
    },
  },
  {
    name: 'find_product_photo',
    description:
      'Look for a picture of a food product in Konzum\'s web shop (the shop most groceries come from: exact products, found with the Croatian text printed on the receipt) and in Open Food Facts (open data, packaged goods by name, or exactly by barcode when the user has one). Returns candidates with source, name, brand, size, country and picture URL. Konzum\'s are the shop\'s own listing and usually the right product, but still check the pack size and flavour in the name (e.g. 330 ml vs 0,5 l, or a different flavour); Open Food Facts is loose: often another country\'s variant or another size. Compare brand, product, size and flavour with the product before choosing, and if none is clearly the same product say so instead of picking one; the user can photograph it themselves in the app. Then call set_product_photo with the chosen imageUrl. Use list_stock to find products whose picture is "none".',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'A product already in the app: its name is used as the search words when query is not given.' },
        query: { type: 'string', description: 'Words to search for, e.g. "Somersby blueberry cider".' },
        code: { type: 'string', description: 'Barcode (EAN) of the product, 6 to 14 digits.' },
      },
    },
  },
  {
    name: 'set_product_photo',
    description:
      'Give a food product a picture from an image URL, e.g. a candidate from find_product_photo, or the product image of a shop the user is buying from. Only when you are confident it shows this exact product. The image must be a public https URL (jpeg, png, webp or avif, under about 700 KB). The picture is queued and the app downscales it and removes its background the next time it syncs, so tell the user it is queued, not already shown. Replaces any earlier picture; null-clearing is done in the app.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name or the words the user used' },
        imageUrl: { type: 'string', description: 'https URL of the picture' },
      },
      required: ['product', 'imageUrl'],
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
    case 'add_wolt_orders':
      return ctx.readOnly ? fail(READ_ONLY) : addWoltOrders(args, ctx, 'wolt');
    case 'add_takeout_orders':
      return ctx.readOnly ? fail(READ_ONLY) : args.service === 'bolt' || args.service === 'uber' ? addWoltOrders(args, ctx, args.service) : fail('service must be "bolt" or "uber"');
    case 'add_rides':
      return ctx.readOnly ? fail(READ_ONLY) : addRides(args, ctx);
    case 'shopping_list':
      return shoppingListTool(ctx);
    case 'product_prices':
      return productPrices(args, ctx);
    case 'list_stock':
      return listStock(args, ctx);
    case 'use_stock':
      return ctx.readOnly ? fail(READ_ONLY) : useStock(args, ctx);
    case 'count_stock':
      return ctx.readOnly ? fail(READ_ONLY) : countStock(args, ctx);
    case 'set_product_info':
      return ctx.readOnly ? fail(READ_ONLY) : setProductInfo(args, ctx);
    case 'find_product_photo':
      return findProductPhoto(args, ctx);
    case 'set_product_photo':
      return ctx.readOnly ? fail(READ_ONLY) : setProductPhoto(args, ctx);
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
    const product: FoodProduct = { id: pid, name: l.name, type, storage: hints[i]?.storage ?? defaultStorage(type, l.kind), shelfLifeDays: hints[i]?.shelfLifeDays, ...(hints[i]?.trackAmount === false ? { trackAmount: false } : {}), ...(l.unit === 'pc' && hints[i]?.packSize ? { packSize: hints[i]!.packSize, packLabel: hints[i]!.packLabel } : {}), createdAt: stamp, updatedAt: stamp };
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

// ---- Wolt ----

async function addWoltOrders(args: Args, { store, now }: ToolContext, service: TakeoutService): Promise<ToolResult> {
  const { orders, rejected } = parseWoltOrders(args.orders, utcToday(now), service);
  const known = new Set((await store.list('woltorders')).map((r) => r.id));
  const stamp = now.toISOString();
  let added = 0;
  for (const o of orders) {
    if (known.has(o.id)) continue; // already saved: orders are never overwritten
    await store.put('woltorders', o.id, { ...o, createdAt: stamp, updatedAt: stamp });
    added++;
  }
  return ok({
    added,
    alreadyAdded: orders.length - added,
    ...(rejected.length ? { rejected, warning: 'Some orders were left out: fix them from the emails and add them again.' } : {}),
  });
}

// ---- rides ----

async function addRides(args: Args, { store, now }: ToolContext): Promise<ToolResult> {
  const { rides, rejected } = parseRides(args.rides, utcToday(now));
  const known = new Set((await store.list('rides')).map((r) => r.id));
  const stamp = now.toISOString();
  let added = 0;
  for (const r of rides) {
    if (known.has(r.id)) continue; // already saved: rides are never overwritten
    await store.put('rides', r.id, { ...r, createdAt: stamp, updatedAt: stamp });
    added++;
  }
  return ok({
    added,
    alreadyAdded: rides.length - added,
    ...(rejected.length ? { rejected, warning: 'Some rides were left out: fix them from the emails and add them again.' } : {}),
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
  return { products, records, events, today, stockFor };
}

/** What the quantity is counted in: "cans" for a multipack, otherwise pieces, kg or l. */
const unitName = (p: ProductSummary, quantity: number): string =>
  p.unit !== 'pc' ? p.unit : p.packSize && p.packLabel ? pluralize(p.packLabel, quantity) : p.packSize ? 'items' : 'pieces';

function describeProduct(p: ProductSummary, s: Stock, hasPicture: boolean) {
  return {
    name: p.name,
    picture: hasPicture ? 'set' : 'none',
    ...(s.tracked
      ? { quantity: s.quantity, unit: unitName(p, s.quantity), ...(p.packSize ? { packSize: p.packSize } : {}) }
      : { tracking: 'have it or out (no amount)', have: s.quantity > 0 }),
    type: p.type,
    storage: p.storage,
    status: s.status,
    ...(s.useBy ? { useBy: s.useBy } : {}),
    ...(s.tracked && s.frozenQuantity > 0 ? { inFreezer: s.frozenQuantity } : {}),
    ...(s.tracked && s.thawedQuantity > 0 ? { thawed: s.thawedQuantity, note: 'Thawed: use this first, do not refreeze.' } : {}),
    // Several purchases are kept apart, each with its own use-by: name one with boughtOn in use_stock.
    ...(s.tracked && s.batches.length > 1
      ? { batches: s.batches.map((b) => ({ boughtOn: p.purchases.find((x) => x.batch === (b.id ? originBatch(b.id) : undefined))?.date ?? b.date, quantity: b.quantity, ...(b.frozen ? { frozenOn: b.frozen } : {}), ...(b.thawed ? { thawedOn: b.thawed } : {}), ...(b.useBy ? { useBy: b.useBy } : {}) })) }
      : {}),
    ...(s.lastConfirmed ? { lastBoughtOrCounted: s.lastConfirmed } : {}),
  };
}

async function listStock(args: Args, { store, now }: ToolContext): Promise<ToolResult> {
  const { products, records, stockFor } = await stockState(store, now);
  const withPicture = new Set(records.filter((r) => (r as unknown as { hasPhoto?: unknown }).hasPhoto).map((r) => r.id));
  const words = normalizeKey(text(args.query) ?? '').split(' ').filter(Boolean);
  const storage = text(args.storage);
  const status = text(args.status);
  const rows = products
    .filter((p) => words.every((w) => normalizeKey(p.name).split(' ').some((x) => x.startsWith(w))))
    .filter((p) => !storage || p.storage === storage)
    .map((p) => ({ p, s: stockFor(p) }))
    .filter(({ s }) => (status ? s.status === status : args.includeOut === true || s.status !== 'out'));
  if (rows.length === 0) return ok('Nothing matches. Stock only covers products that were bought and saved from a receipt.');
  return ok(rows.map(({ p, s }) => describeProduct(p, s, withPicture.has(p.id))));
}

async function shoppingListTool({ store, now }: ToolContext): Promise<ToolResult> {
  const { products, today, stockFor } = await stockState(store, now);
  const items = shoppingList(products.map((product) => ({ product, stock: stockFor(product), uses: 0 })), today);
  if (items.length === 0) return ok('Nothing to buy: nothing is out or low, and nothing is due to be rebought yet.');
  return ok(
    items.map((i) => ({
      name: i.name,
      why: REASON_LABELS[i.reason],
      usualQuantity: i.quantity,
      unit: i.unit === 'pc' ? 'pieces or packs as bought' : i.unit,
      ...(i.everyDays ? { usuallyBoughtEveryDays: i.everyDays } : {}),
      daysSinceLastBought: i.daysSince,
      ...(i.store && i.price ? { cheapestStore: i.store, shelfPrice: `${i.price.regular.toFixed(2)}${i.per}` } : { cheapestStore: 'unknown' }),
      ...(i.saving ? { savesVersusLastStore: i.saving } : {}),
    })),
  );
}

async function productPrices(args: Args, { store, now }: ToolContext): Promise<ToolResult> {
  const { products, today } = await stockState(store, now);
  const found = resolveProduct(args.product, products);
  if ('error' in found) return found.error;
  const p = found.product;
  const c = comparePrices(p, today);
  if (!c) return ok(`No price for "${p.name}" from the last six months.`);
  const per = priceUnit(p);
  const offers = offerShare(p);
  return ok({
    name: p.name,
    pricesPer: per.replace(/^ (\/ )?/, ''),
    stores: c.prices.map((x) => ({ store: x.store, shelfPrice: x.regular, lastPaid: x.paid, onOfferLastTime: x.onOffer, lastBought: x.date, lowestShelfPrice: x.lowestRegular, times: x.purchases })),
    lastBoughtAt: c.usual.store,
    ...(c.cheaper ? { cheaperElsewhere: { store: c.cheaper.store, saves: c.saving, savesPercent: Math.round((c.savingPct ?? 0) * 100) } } : { cheaperElsewhere: 'no' }),
    ...(offers.offers ? { onOffer: `${offers.offers} of ${offers.of} purchases, saving ${offers.saved}` } : {}),
  });
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
  const action = args.action === 'finish' || args.action === 'toss' || args.action === 'some_left' || args.action === 'freeze' || args.action === 'thaw' ? args.action : 'use';
  const stockBefore = stockFor(p);
  const before = stockBefore.quantity;
  const untracked = !stockBefore.tracked;

  // Optionally one batch (one purchase) instead of whatever expires first.
  let batch: Batch | undefined;
  const boughtOn = text(args.boughtOn);
  if (boughtOn) {
    if (untracked) return fail(`"${p.name}" is tracked as have it or out, so it has no batches.`);
    if (!isRealDate(boughtOn)) return fail('boughtOn must be YYYY-MM-DD.');
    if (action === 'some_left') return fail('some_left applies to the pack in use, not to a batch. Use action "use" with a quantity.');
    const dateOf = (b: Batch) => p.purchases.find((x) => x.batch === (b.id ? originBatch(b.id) : undefined))?.date ?? b.date;
    const state = (b: Batch) => (b.frozen ? ', frozen' : b.thawed ? ', thawed' : '');
    const list = stockBefore.batches.map((b) => `${dateOf(b)}: ${formatQty(b.quantity)}${state(b)}${b.useBy ? ` (use by ${b.useBy})` : ''}`).join('; ');
    let named = stockBefore.batches.filter((b) => b.id && dateOf(b) === boughtOn);
    if (named.length === 0) return fail(`No batch of "${p.name}" bought on ${boughtOn} is in stock. Batches: ${list || 'none'}.`);
    // One purchase can be split into fridge, frozen and thawed batches: only some of them fit freezing or thawing.
    if (action === 'freeze' || action === 'thaw') {
      const fits = named.filter((b) => (action === 'freeze' ? !b.frozen && !b.thawed : !!b.frozen));
      if (fits.length === 0) {
        if (action === 'thaw') return fail(`Nothing of "${p.name}" bought on ${boughtOn} is frozen.`);
        return fail(named.some((b) => b.thawed) ? `What is left of "${p.name}" bought on ${boughtOn} outside the freezer was thawed. Thawed food is not frozen again: it should be used soon.` : `That batch of "${p.name}" is already in the freezer.`);
      }
      named = fits;
    }
    if (named.length > 1) return fail(`Several batches of "${p.name}" were bought on ${boughtOn} (${list}). Ask the user which one, or leave boughtOn out.`);
    batch = named[0];
  }

  let type: StockEvent['type'];
  let quantity: number;
  if (action === 'finish') {
    type = 'count';
    quantity = 0;
  } else if (action === 'toss') {
    if ((batch?.quantity ?? before) <= 0) return fail(`None of "${p.name}" is in stock, so there is nothing to throw away.`);
    type = 'toss';
    quantity = batch?.quantity ?? before;
  } else if (action === 'freeze' || action === 'thaw') {
    if (untracked) return fail(`"${p.name}" is tracked as have it or out, so it has no amount to put in the freezer.`);
    const movable = batch ? batch.quantity : action === 'freeze' ? before - stockBefore.frozenQuantity - stockBefore.thawedQuantity : stockBefore.frozenQuantity;
    if (movable <= 0) {
      if (action === 'freeze' && stockBefore.thawedQuantity > 0) return fail(`What is left of "${p.name}" outside the freezer was thawed, and thawed food is not frozen again: it should be used soon.`);
      return fail(action === 'freeze' ? `Nothing of "${p.name}" is outside the freezer.` : `Nothing of "${p.name}" is frozen.`);
    }
    const q = args.quantity === undefined ? movable : args.quantity;
    if (typeof q !== 'number' || !Number.isFinite(q) || q <= 0 || q > 10_000) return fail('quantity must be a positive number.');
    type = action;
    quantity = Math.round(Math.min(q, movable) * 1000) / 1000;
  } else if (action === 'some_left') {
    if (untracked) return fail(`"${p.name}" is tracked as have it or out, so it has no amount to lower. Use action "use" to log a use, or "finish" when it is all gone.`);
    if (p.packSize) return fail(`"${p.name}" comes in packs of ${p.packSize} and is counted in single ${p.packLabel ? pluralize(p.packLabel, 2) : 'items'}, so there is no "part left". Use action "use" with the number of items used, or count_stock with how many are left.`);
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
  const event: StockEvent = { id: newId(), productId: p.id, type, quantity, date, source: 'claude', ...(batch?.id ? { batch: batch.id } : {}), ...(action === 'finish' && args.dateUnknown === true ? { undated: true } : {}), ...(args.notInStats === true ? { untracked: true } : {}), note: text(args.note, 500), createdAt: stamp, updatedAt: stamp };
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
    ...(batch ? { batch: `bought ${boughtOn}` } : {}),
    ...(action === 'freeze' || action === 'thaw' ? { moved: formatQty(quantity), inFreezerNow: left.frozenQuantity, ...(action === 'thaw' ? { note: 'Taken out of the freezer: it now has a use-by two days on.' } : {}) } : {}),
    ...(action === 'use' || action === 'some_left' ? { used: formatQty(quantity) } : {}),
    left: left.quantity,
    unit: unitName(p, left.quantity),
    ...(action === 'use' && quantity > before ? { note: `Only ${formatQty(before)} was thought to be in stock, so it now shows none left.` } : {}),
  });
}

async function setProductInfo(args: Args, { store, now, newId }: ToolContext): Promise<ToolResult> {
  const { products, records } = await stockState(store, now);
  const found = resolveProduct(args.product, products);
  if ('error' in found) return found.error;
  const p = found.product;
  const { product: _ignored, ...rest } = args;
  const changes = parseProductChanges(rest);
  if (typeof changes === 'string') return fail(changes);
  if ((changes.packSize || changes.packLabel) && p.unit !== 'pc') return fail(`"${p.name}" is bought by the ${p.unit}, so it has no pack size. Pack size only fits products sold in pieces.`);

  const stamp = now.toISOString();
  const record = records.find((r) => r.id === p.id);
  const described = Object.entries(changes).map(([k, v]) => `${k}: ${v === null ? 'cleared' : String(v)}`).join(', ');
  if (!record) {
    // Nothing to overwrite: a product that has no settings yet gets them now.
    const base: FoodProduct = { id: p.id, name: p.name, type: p.type, storage: p.storage, createdAt: stamp, updatedAt: stamp };
    await store.put('foodproducts', p.id, withProductChanges(base, changes, stamp));
    return ok({ product: p.name, set: described, applied: 'now' });
  }
  // The product has settings the owner (or an earlier call) may be editing: the app applies this, like other edits.
  const request: ProductEditRequest = {
    id: newId(), type: 'product-edit', itemIds: [], outfitIds: [], productId: p.id,
    base: { name: p.name, type: p.type, storage: p.storage }, changes, source: 'claude', createdAt: stamp, updatedAt: stamp,
  };
  await store.put('inbox', request.id, request);
  return ok({
    product: p.name,
    queued: described,
    applied: 'when the app next syncs',
    note: 'Not applied yet: stock keeps counting with the old settings until the app syncs, so tell the user it is queued and wait before logging uses of this product.',
  });
}

async function findProductPhoto(args: Args, { store, now, searchPhotos: search }: ToolContext): Promise<ToolResult> {
  if (!search) return fail('Picture search is not available in this deployment.');
  let query = text(args.query, 100);
  let rawName: string | undefined;
  let shop: string | undefined;
  const code = text(args.code, 20);
  if (!query && !code) {
    const { products } = await stockState(store, now);
    const found = resolveProduct(args.product, products);
    if ('error' in found) return found.error;
    query = found.product.name;
    // The text printed on the receipt (Croatian) is the way into the shop's catalogue.
    rawName = found.product.purchases[0]?.rawName;
    shop = found.product.purchases[0]?.store;
  }
  const r = await search({ query, rawName, code, store: shop });
  if (r.error && r.candidates.length === 0) return fail(`${r.error} Try again in a minute, or use a barcode.`);
  if (r.candidates.length === 0) return ok({ candidates: [], note: 'Nothing found. Try other words or the barcode, or ask the user to photograph the product in the app.' });
  return ok({
    searched: code ? `barcode ${code}` : query,
    candidates: r.candidates.map((c) => ({ source: c.source, name: c.name, brand: c.brand, size: c.quantity, country: c.country, code: c.code, imageUrl: c.imageUrl })),
    note: 'Pick one only if brand, product, size and flavour match; otherwise tell the user none matched.',
  });
}

async function setProductPhoto(args: Args, { store, now, newId, fetchPhoto: download = fetchPhoto }: ToolContext): Promise<ToolResult> {
  const { products } = await stockState(store, now);
  const found = resolveProduct(args.product, products);
  if ('error' in found) return found.error;
  const p = found.product;
  const url = text(args.imageUrl, 2000);
  if (!url || !url.startsWith('https://')) return fail('imageUrl must be an https URL.');
  const photo = await download(url);
  if (!photo) return fail(PHOTO_FAILED);

  // Applied by the app like other product edits (which also creates the record if the product has none).
  const stamp = now.toISOString();
  const request: ProductEditRequest = {
    id: newId(), type: 'product-edit', itemIds: [], outfitIds: [], productId: p.id,
    base: { name: p.name, type: p.type, storage: p.storage }, changes: { photo }, source: 'claude', createdAt: stamp, updatedAt: stamp,
  };
  await store.put('inbox', request.id, request);
  return ok({ product: p.name, queued: 'picture', applied: 'when the app next syncs', note: 'Queued, not shown yet: the app downscales it and removes the background when it next syncs.' });
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
  const event: StockEvent = { id: newId(), productId: p.id, type: 'count', quantity: Math.round(q * 1000) / 1000, date, source: 'claude', ...(args.notInStats === true ? { untracked: true } : {}), createdAt: stamp, updatedAt: stamp };
  await store.put('foodstock', event.id, event);
  const untracked = p.trackAmount === false;
  return ok(untracked ? { counted: p.name, have: event.quantity > 0 } : { counted: p.name, quantity: event.quantity, unit: unitName(p, event.quantity) });
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
