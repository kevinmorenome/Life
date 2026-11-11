// MCP tools for the Recipe Book: add a recipe, list and read recipes with what the stock says, and log that a
// recipe was cooked (cooking along in chat ends with it). They reuse the app's pure recipe helpers, so the stock
// check and the amounts taken off are the ones the app's own cooking view would use. Tools never edit an existing
// record: a new recipe is a fresh record, a cooked day goes through the inbox (`CookedRequest`, applied by the app),
// and stock changes are fresh `use` events. Dates are UTC days, as the Worker has no time zone.

import { normalizeKey, productSummaries, type ProductSummary } from '../src/modules/food/products';
import { formatAmount, stockOf } from '../src/modules/food/stock';
import type { FoodProduct, FoodReceipt, StockEvent } from '../src/modules/food/types';
import { checkRecipe, matchProduct, moreText, type IngredientCheck, type StockedProduct } from '../src/modules/recipes/availability';
import { cookLines, stepTimers, type CookLine } from '../src/modules/recipes/cooking';
import { ingredientAmount, parseAmount, scaleIngredients } from '../src/modules/recipes/ingredients';
import { totalMinutes } from '../src/modules/recipes/recipes';
import type { Recipe, RecipeIngredient } from '../src/modules/recipes/types';
import type { CookedRequest } from './protocol';
import type { ToolContext, ToolResult } from './mcpTools';
import { fail, isRealDate, ok, strings, text, utcToday, type Args } from './toolUtil';

const READ_ONLY = 'This deployment is read-only.';

export const RECIPE_TOOLS = [
  {
    name: 'add_recipe',
    description:
      'Add a recipe to the user\'s Recipe Book (Food → Recipes in the app): name, ingredients with amounts, steps in order, servings, prep and cook time in minutes, tags. Use it when the user dictates a recipe, pastes one from a website or asks you to save one. Each ingredient\'s amount is text with its unit: "250 g", "0.5 kg", "1/2 cup", "2 tbsp", "3" (pieces), "a pinch", "to taste"; add optional: true for optional ones. Write each step as a short first sentence (it becomes the step\'s title in the app\'s cooking view) followed by the details, and mention times in the text ("cook for 10 minutes") so the app offers a timer. Refuses a recipe with the same name unless confirmDuplicate is true (ask the user first). The result says which of the user\'s grocery products each ingredient matches.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        servings: { type: 'integer', minimum: 1, maximum: 99, description: 'Default 2.' },
        prepTime: { type: 'integer', minimum: 0, description: 'Minutes.' },
        cookTime: { type: 'integer', minimum: 0, description: 'Minutes.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'e.g. dinner, quick, vegetarian.' },
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, amount: { type: 'string', description: '"250 g", "1/2 cup", "2", "a pinch", "to taste".' }, optional: { type: 'boolean' }, note: { type: 'string' } },
            required: ['name'],
          },
        },
        steps: { type: 'array', items: { type: 'string' } },
        confirmDuplicate: { type: 'boolean', description: 'true only after the user confirmed adding a second recipe with the same name.' },
      },
      required: ['name', 'ingredients', 'steps'],
    },
  },
  {
    name: 'list_recipes',
    description:
      'The user\'s recipes, favourites first then by name: id, name, tags, servings, minutes, how often and when last cooked, and whether the current stock covers it (canCook, and what is lacking). Filter with words (query, matching the name, an ingredient or a tag), a tag, favourites, or cookableOnly for "what can I make right now?". Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        tag: { type: 'string' },
        favorites: { type: 'boolean' },
        cookableOnly: { type: 'boolean', description: 'Only recipes the stock covers (optional ingredients and pantry staples never count as lacking).' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Default 20.' },
      },
    },
  },
  {
    name: 'get_recipe',
    description:
      'One recipe in full, to read it out or cook along with the user in chat: ingredients scaled to `servings` with what the stock says for each (in stock, need more, missing, always in the pantry), what would come off the stock when it is logged as cooked (takeOff, in the product\'s own unit), the steps with the timers they mention, how often it was cooked, and links to open it or its cooking view in the app. To cook along: go through the steps one at a time, then show the takeOff amounts, ask the user to confirm or correct them, and call log_cooked. Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        recipe: { type: 'string', description: 'The recipe id, or words from its name.' },
        servings: { type: 'integer', minimum: 1, maximum: 99, description: 'Default: the recipe\'s own.' },
      },
      required: ['recipe'],
    },
  },
  {
    name: 'log_cooked',
    description:
      'Record that the user cooked a recipe (it shows on the calendar, the day screen, the recipe and Stats → Recipes), and optionally take what was used off the food stock. Only call it after the user confirmed the amounts. stock: "suggested" takes off get_recipe\'s takeOff amounts (scaled to servings), with `amounts` to change any of them (in the product\'s unit, 0 = not used); "none" only records the day. Never more than what is in stock is taken off. One record per recipe and day: logging the same day again records nothing new and takes nothing off. The cooked day is added by the app on its next sync; the stock changes count at once.',
    inputSchema: {
      type: 'object',
      properties: {
        recipe: { type: 'string', description: 'The recipe id, or words from its name.' },
        date: { type: 'string', description: 'YYYY-MM-DD. Default: today (UTC).' },
        servings: { type: 'integer', minimum: 1, maximum: 99, description: 'How many it was cooked for. Default: the recipe\'s own.' },
        stock: { type: 'string', enum: ['suggested', 'none'] },
        amounts: {
          type: 'array',
          items: { type: 'object', properties: { ingredient: { type: 'string' }, quantity: { type: 'number', minimum: 0 } }, required: ['ingredient', 'quantity'] },
          description: 'Changes to the suggested amounts: the ingredient\'s name and what was really used, in the unit get_recipe gave for it.',
        },
      },
      required: ['recipe', 'stock'],
    },
  },
] as const;

export async function callRecipeTool(name: string, args: Args, ctx: ToolContext): Promise<ToolResult | undefined> {
  switch (name) {
    case 'add_recipe':
      return ctx.readOnly ? fail(READ_ONLY) : addRecipe(args, ctx);
    case 'list_recipes':
      return listRecipes(args, ctx);
    case 'get_recipe':
      return getRecipe(args, ctx);
    case 'log_cooked':
      return ctx.readOnly ? fail(READ_ONLY) : logCooked(args, ctx);
    default:
      return undefined;
  }
}

// ---- shared ----

/** The recipes, the products bought (from the receipts) with their stock today, and the pantry staples. */
async function kitchen({ store, now }: ToolContext) {
  const recipes = (await store.list('recipes')) as unknown as Recipe[];
  const receipts = (await store.list('foodreceipts')) as unknown as FoodReceipt[];
  const records = (await store.list('foodproducts')) as unknown as FoodProduct[];
  const events = (await store.list('foodstock')) as unknown as StockEvent[];
  const settings = await store.list('settings');
  const today = utcToday(now);
  const products = productSummaries(receipts, records);
  const stocked = new Map<string, StockedProduct>(products.map((p) => [p.id, { product: p, stock: stockOf(p, p.purchases, events.filter((e) => e.productId === p.id), today) }]));
  const staples = new Set(strings(settings.find((s) => s.id === 'app')?.pantryStaples));
  for (const r of recipes) {
    r.ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
    r.steps = Array.isArray(r.steps) ? r.steps : [];
    r.tags = Array.isArray(r.tags) ? r.tags : [];
    r.cooked = Array.isArray(r.cooked) ? r.cooked : [];
    r.servings = typeof r.servings === 'number' && r.servings > 0 ? r.servings : 2;
  }
  return { recipes, products, stocked, staples, today };
}

/** A recipe by id, else by words of its name; refuses an unknown or ambiguous one with the candidates. */
function resolveRecipe(query: unknown, recipes: Recipe[]): { recipe: Recipe } | { error: ToolResult } {
  const q = text(query);
  if (!q) return { error: fail('recipe is required: an id or words from the name.') };
  const byId = recipes.find((r) => r.id === q);
  if (byId) return { recipe: byId };
  const key = normalizeKey(q);
  const exact = recipes.filter((r) => normalizeKey(r.name) === key);
  if (exact.length === 1) return { recipe: exact[0] };
  const words = key.split(' ').filter(Boolean);
  const hits = recipes.filter((r) => words.every((w) => normalizeKey(r.name).includes(w)));
  if (hits.length === 1) return { recipe: hits[0] };
  if (hits.length === 0) return { error: fail(`No recipe matches "${q}". Recipes: ${recipes.map((r) => r.name).join(', ') || 'none yet'}.`) };
  return { error: fail(`Several recipes match "${q}": ${hits.map((r) => `${r.name} (${r.id})`).join(', ')}. Ask the user which one.`) };
}

/** What the stock says about an ingredient, in words. */
function stockWords(c: IngredientCheck): string {
  if (c.staple) return 'always in the pantry';
  if (c.state === 'available') return c.unverified ? 'in stock (amount not comparable)' : 'in stock';
  if (c.state === 'partial') return `need ${moreText(c.more ?? 0, c.ingredient.unit)}`;
  return c.ingredient.optional ? 'none (optional)' : 'missing';
}

const unitWord = (p: ProductSummary) => (p.unit === 'pc' ? (p.packSize && p.packLabel ? `${p.packLabel}s` : 'pieces') : p.unit);

const NOT_TRACKED: Record<NonNullable<CookLine['notTracked']>, string> = {
  staple: 'always in the pantry, not counted',
  unlinked: 'not among the groceries bought, not counted',
  'none-left': 'none in stock',
};

const appLink = (ctx: ToolContext, path: string) => `${ctx.appUrl}/#${path}`;

// ---- add_recipe ----

async function addRecipe(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const name = text(args.name, 120);
  if (!name) return fail('name is required.');
  const { recipes, products } = await kitchen(ctx);
  const same = recipes.find((r) => normalizeKey(r.name) === normalizeKey(name));
  if (same && args.confirmDuplicate !== true) return fail(`There is already a recipe called "${same.name}" (${same.id}). Ask the user whether to add a second one; if so call again with confirmDuplicate: true.`);

  const rawIngredients = Array.isArray(args.ingredients) ? args.ingredients : [];
  if (rawIngredients.length > 60) return fail('At most 60 ingredients.');
  const bad: string[] = [];
  const ingredients: RecipeIngredient[] = [];
  for (const raw of rawIngredients) {
    const r = (raw ?? {}) as Args;
    const ingName = text(r.name, 120);
    if (!ingName) continue;
    const amount = parseAmount(typeof r.amount === 'string' ? r.amount : typeof r.amount === 'number' ? String(r.amount) : '');
    if (!amount) {
      bad.push(`${ingName}: "${String(r.amount)}"`);
      continue;
    }
    ingredients.push({
      id: ctx.newId(),
      name: ingName,
      unit: amount.unit,
      ...(amount.quantity !== undefined ? { quantity: amount.quantity } : {}),
      ...(r.optional === true ? { optional: true } : {}),
      ...(text(r.note, 200) ? { notes: text(r.note, 200) } : {}),
    });
  }
  if (bad.length) return fail(`Can't read these amounts: ${bad.join('; ')}. Write them like "250 g", "0.5 kg", "1/2 cup", "2 tbsp", "3", "a pinch" or "to taste".`);
  const steps = strings(args.steps).map((s) => s.trim().slice(0, 1000)).filter(Boolean);
  if (steps.length > 40) return fail('At most 40 steps.');
  const minutes = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), 24 * 60) : undefined);
  const servings = typeof args.servings === 'number' && args.servings >= 1 ? Math.min(99, Math.round(args.servings)) : 2;
  const tags = [...new Set(strings(args.tags).map((t) => t.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 20);
  const stamp = ctx.now.toISOString();
  const recipe: Recipe = {
    id: ctx.newId(),
    name,
    ...(text(args.description, 1000) ? { description: text(args.description, 1000) } : {}),
    ingredients,
    steps,
    servings,
    ...(minutes(args.prepTime) ? { prepTime: minutes(args.prepTime) } : {}),
    ...(minutes(args.cookTime) ? { cookTime: minutes(args.cookTime) } : {}),
    tags,
    cooked: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  await ctx.store.put('recipes', recipe.id, recipe);
  return ok({
    added: recipe.name,
    id: recipe.id,
    ingredients: ingredients.map((i) => ({ name: i.name, amount: ingredientAmount(i), ...(i.optional ? { optional: true } : {}), matchesProduct: matchProduct(i.name, products)?.name ?? null })),
    steps: steps.length,
    link: appLink(ctx, `/recipes/${recipe.id}`),
    note: 'The app shows it after its next sync. Ingredients that match no product can be linked in the app (Edit, then pick the product while typing the name).',
  });
}

// ---- list_recipes ----

async function listRecipes(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { recipes, products, stocked, staples } = await kitchen(ctx);
  const words = normalizeKey(text(args.query) ?? '').split(' ').filter(Boolean);
  const tag = text(args.tag)?.toLowerCase();
  const limit = Math.min(Math.max(Math.floor(Number(args.limit)) || 20, 1), 100);
  const rows = recipes
    .filter((r) => !args.favorites || r.favorite)
    .filter((r) => !tag || r.tags.includes(tag))
    .filter((r) => {
      if (!words.length) return true;
      const hay = normalizeKey([r.name, ...r.ingredients.map((i) => i.name), ...r.tags].join(' '));
      return words.every((w) => hay.includes(w));
    })
    .map((r) => ({ r, check: checkRecipe(r.ingredients, stocked, products, staples) }))
    .filter((x) => !args.cookableOnly || x.check.canCook)
    .sort((a, b) => Number(!!b.r.favorite) - Number(!!a.r.favorite) || a.r.name.localeCompare(b.r.name));
  if (!recipes.length) return ok('No recipes yet. Add one with add_recipe.');
  return ok({
    count: rows.length,
    recipes: rows.slice(0, limit).map(({ r, check }) => {
      const days = [...new Set(r.cooked ?? [])].sort();
      return {
        id: r.id,
        name: r.name,
        ...(r.favorite ? { favorite: true } : {}),
        tags: r.tags,
        servings: r.servings,
        ...(totalMinutes(r) ? { minutes: totalMinutes(r) } : {}),
        timesCooked: days.length,
        ...(days.length ? { lastCooked: days[days.length - 1] } : {}),
        canCook: check.canCook,
        ...(check.lacking.length ? { lacking: check.lacking.map((c) => `${c.ingredient.name} (${stockWords(c)})`) } : {}),
      };
    }),
  });
}

// ---- get_recipe ----

async function getRecipe(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { recipes, products, stocked, staples } = await kitchen(ctx);
  const found = resolveRecipe(args.recipe, recipes);
  if ('error' in found) return found.error;
  const r = found.recipe;
  const servings = typeof args.servings === 'number' && args.servings >= 1 ? Math.min(99, Math.round(args.servings)) : r.servings;
  const scaled = scaleIngredients(r.ingredients, r.servings, servings);
  const check = checkRecipe(scaled, stocked, products, staples);
  const lines = cookLines(check.items, (id) => stocked.get(id)?.stock.quantity ?? 0);
  const days = [...new Set(r.cooked ?? [])].sort();
  return ok({
    id: r.id,
    name: r.name,
    ...(r.description ? { description: r.description } : {}),
    servings,
    ...(servings !== r.servings ? { recipeServings: r.servings, note: `Amounts scaled from ${r.servings} to ${servings} servings.` } : {}),
    ...(r.prepTime ? { prepMinutes: r.prepTime } : {}),
    ...(r.cookTime ? { cookMinutes: r.cookTime } : {}),
    tags: r.tags,
    canCook: check.canCook,
    ingredients: check.items.map((c, i) => {
      const l = lines[i];
      return {
        name: c.ingredient.name,
        amount: ingredientAmount(c.ingredient),
        ...(c.ingredient.optional ? { optional: true } : {}),
        ...(c.ingredient.notes ? { note: c.ingredient.notes } : {}),
        stock: stockWords(c),
        ...(c.product ? { product: c.product.name } : {}),
        takeOff: l.notTracked
          ? NOT_TRACKED[l.notTracked]
          : { quantity: Math.round(l.amount * 1000) / 1000, unit: unitWord(l.product!), inStock: Math.round(l.left * 1000) / 1000, ...(l.basis === 'guess' ? { check: `a guess: the recipe says ${ingredientAmount(c.ingredient)}` } : l.basis === 'unknown' ? { check: 'the recipe gives no amount: ask how much was used' } : {}) },
      };
    }),
    steps: r.steps.map((s, i) => {
      const timers = stepTimers(s);
      return { step: i + 1, text: s, ...(timers.length ? { timers: timers.map((t) => t.label) } : {}) };
    }),
    timesCooked: days.length,
    ...(days.length ? { lastCooked: days[days.length - 1] } : {}),
    links: { recipe: appLink(ctx, `/recipes/${r.id}`), cookInApp: appLink(ctx, `/recipes/${r.id}/cook/${servings}`) },
  });
}

// ---- log_cooked ----

async function logCooked(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { recipes, products, stocked, staples, today } = await kitchen(ctx);
  const found = resolveRecipe(args.recipe, recipes);
  if ('error' in found) return found.error;
  const r = found.recipe;
  const date = args.date === undefined ? today : args.date;
  if (!isRealDate(date)) return fail('date must be YYYY-MM-DD.');
  if (date > today) return fail('date can\'t be in the future.');
  if (args.stock !== 'suggested' && args.stock !== 'none') return fail('stock must be "suggested" (take the confirmed amounts off the stock) or "none" (only record the day).');

  // One record per recipe and day, so a second call never takes the ingredients off twice.
  const requestId = `cooked-${r.id}-${date}`;
  const inbox = await ctx.store.list('inbox');
  if ((r.cooked ?? []).includes(date) || inbox.some((x) => x.id === requestId)) {
    return ok({ recipe: r.name, date, alreadyLogged: true, note: 'This recipe was already logged as cooked that day, so nothing new was recorded and nothing was taken off the stock. If more was used, use use_stock.' });
  }

  const servings = typeof args.servings === 'number' && args.servings >= 1 ? Math.min(99, Math.round(args.servings)) : r.servings;
  const scaled = scaleIngredients(r.ingredients, r.servings, servings);
  const lines = cookLines(checkRecipe(scaled, stocked, products, staples).items, (id) => stocked.get(id)?.stock.quantity ?? 0);
  const amounts: Record<string, number> = Object.fromEntries(lines.map((l) => [l.ingredient.id, l.amount]));
  for (const raw of Array.isArray(args.amounts) ? args.amounts : []) {
    const a = (raw ?? {}) as Args;
    const key = normalizeKey(String(a.ingredient ?? ''));
    const line = lines.find((l) => normalizeKey(l.ingredient.name) === key) ?? lines.find((l) => key && normalizeKey(l.ingredient.name).includes(key));
    if (!line) return fail(`"${String(a.ingredient)}" is not an ingredient of ${r.name}. Ingredients: ${lines.map((l) => l.ingredient.name).join(', ')}.`);
    if (typeof a.quantity !== 'number' || !Number.isFinite(a.quantity) || a.quantity < 0) return fail(`The quantity for ${line.ingredient.name} must be 0 or more.`);
    amounts[line.ingredient.id] = a.quantity;
  }

  const stamp = ctx.now.toISOString();
  const takenOff: string[] = [];
  if (args.stock === 'suggested') {
    for (const l of lines) {
      if (!l.product || l.notTracked) continue;
      const q = Math.round(Math.min(Math.max(0, amounts[l.ingredient.id] ?? 0), l.left) * 1000) / 1000;
      if (q <= 0) continue;
      const event: StockEvent = { id: ctx.newId(), productId: l.product.id, type: 'use', quantity: q, date, source: 'claude', note: `Cooked ${r.name}`, createdAt: stamp, updatedAt: stamp };
      await ctx.store.put('foodstock', event.id, event);
      takenOff.push(`${l.product.name}: ${formatAmount(q, l.product.unit)} ${unitWord(l.product)}`);
    }
  }
  const request: CookedRequest = { id: requestId, type: 'cooked', recipeId: r.id, date, itemIds: [], outfitIds: [], source: 'claude', createdAt: stamp, updatedAt: stamp };
  await ctx.store.put('inbox', request.id, request);

  const skipped = lines.filter((l) => l.notTracked).map((l) => `${l.ingredient.name}: ${NOT_TRACKED[l.notTracked!]}`);
  return ok({
    logged: r.name,
    date,
    servings,
    takenOffStock: args.stock === 'suggested' ? (takenOff.length ? takenOff : 'nothing') : 'not changed (stock: none)',
    ...(args.stock === 'suggested' && skipped.length ? { notTakenOff: skipped } : {}),
    note: 'The stock changes count at once; the cooked day shows on the recipe, the calendar and Stats → Recipes after the app\'s next sync.',
  });
}
