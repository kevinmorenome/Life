import { shortDate } from '../../lib/format';
import { unitLabel } from './products';
import { formatAmount, originBatch, partLeft, type Batch } from './stock';
import type { Entry } from './stockEntries';
import { stockEvent } from './stockActions';
import type { StockEvent } from './types';
import type { UsageLine } from './usageParse';

/** The day a batch was bought (a frozen or thawed batch follows its name back to the receipt line). */
export function purchaseDateOf(entry: Entry, b: Batch): string {
  return entry.product.purchases.find((x) => x.batch === (b.id ? originBatch(b.id) : undefined))?.date ?? b.date;
}

/** Batches with something left, oldest purchase first; of two from one purchase, the one that is not frozen first. */
export function batchesOldestFirst(entry: Entry): Batch[] {
  return entry.stock.batches
    .filter((b) => b.quantity > 1e-9)
    .sort((a, b) => purchaseDateOf(entry, a).localeCompare(purchaseDateOf(entry, b)) || Number(!!a.frozen) - Number(!!b.frozen));
}

export interface PlanStep {
  /** What happens, in words: "Use ½ of Pesto sauce 190g". */
  text: string;
  /** Which batch it comes from, in words: "bought 3 Nov, 2 left". */
  batch?: string;
  event: StockEvent;
}

export interface Plan {
  steps: PlanStep[];
  /** Why nothing can be logged yet, as one short question or refusal. */
  question?: string;
  /** Things worth knowing before confirming (a backdated event that a later count would swallow). */
  warnings: string[];
}

const label = (e: Entry, q: number) => `${formatAmount(q, e.product.unit)}${unitLabel(e.product, q)}`;
const batchText = (e: Entry, b: Batch) => `bought ${shortDate(purchaseDateOf(e, b))}, ${formatAmount(b.quantity, e.product.unit)} left${b.frozen ? ', frozen' : b.thawed ? ', thawed' : ''}`;

/** The amount in the product's own unit, or a question when it can't be told without guessing. */
function quantityOf(line: UsageLine, e: Entry): { quantity?: number; question?: string } {
  const a = line.amount;
  const { unit, packSize } = e.product;
  if (!a) return {};
  if (a.kind === 'measure') {
    const grams = { g: 1, kg: 1000 } as Record<string, number>;
    const litres = { ml: 1, cl: 10, dl: 100, l: 1000 } as Record<string, number>;
    if (unit === 'kg' && a.unit in grams) return { quantity: (a.value * grams[a.unit]) / 1000 };
    if (unit === 'l' && a.unit in litres) return { quantity: (a.value * litres[a.unit]) / 1000 };
    return { question: unit === 'pc' ? `${e.product.name} is counted in pieces. Say how many, or a fraction like half.` : `${e.product.name} is counted in ${unit}. Say the amount in ${unit === 'kg' ? 'g or kg' : 'ml or l'}.` };
  }
  if (a.kind === 'fraction') {
    if (unit !== 'pc') return { question: `Half of how much? ${e.product.name} is counted in ${unit}: say the amount, like 300 ${unit === 'kg' ? 'g' : 'ml'}.` };
    if (packSize) return { question: `${e.product.name} is counted in single items (packs of ${packSize}). Say how many items.` };
    return { quantity: a.value };
  }
  if (unit !== 'pc') return { question: `${e.product.name} is counted in ${unit}. Say the amount in ${unit === 'kg' ? 'g or kg' : 'ml or l'}.` };
  return { quantity: a.value };
}

/**
 * The events that logging this line would write, for the chosen product. Stock comes off the batch with the oldest purchase
 * (spilling into the next when one is not enough), never the one that happens to expire first; each event is its own new record
 * dated on the day the user meant, and nothing else is touched.
 */
export function planLine(line: UsageLine, e: Entry, events: StockEvent[], today: string): Plan {
  const warnings: string[] = [];
  const fail = (question: string): Plan => ({ steps: [], question, warnings });
  if (line.question) return fail(line.question);
  if (line.date > today) return fail('That date has not happened yet.');

  const date = line.date;
  const all = batchesOldestFirst(e);
  // For a backdated event, the batches that already existed on that day come first.
  const existed = all.filter((b) => purchaseDateOf(e, b) <= date);
  const pool = existed.length > 0 ? existed : all;
  if (existed.length === 0 && all.length > 0) warnings.push(`Everything in stock was bought after ${shortDate(date)}, so this may not change the stock.`);
  const make = (type: StockEvent['type'], quantity: number, batch?: Batch): StockEvent => ({
    ...stockEvent(e.product.id, type, Math.round(quantity * 1000) / 1000, 'app'),
    date,
    ...(batch?.id ? { batch: batch.id } : {}),
    ...(line.notInStats ? { untracked: true } : {}),
  });
  const steps: PlanStep[] = [];
  const name = e.product.name;
  const { quantity, question } = quantityOf(line, e);
  if (question) return fail(question);

  /** Takes `amount` from `batches`, oldest first, as one event per batch. */
  function spread(type: 'use' | 'toss' | 'freeze' | 'thaw', amount: number, batches: Batch[], verb: string): string | undefined {
    let left = amount;
    for (const b of batches) {
      if (left <= 1e-9) break;
      const take = Math.min(b.quantity, left);
      steps.push({ text: `${verb} ${label(e, take)} of ${name}`, batch: batchText(e, b), event: make(type, take, b) });
      left -= take;
    }
    if (left > 1e-9) return `Only ${label(e, amount - left)} of ${name} ${type === 'thaw' ? 'is frozen' : 'is in stock'}.`;
  }

  if (line.action === 'use' || line.action === 'toss') {
    const verb = line.action === 'use' ? 'Use' : 'Throw out';
    if (all.length === 0) return fail(`None of ${name} is in stock.`);
    // Throwing out with no amount means the whole oldest batch.
    const amount = quantity ?? (line.action === 'toss' ? pool[0].quantity : undefined);
    if (amount === undefined) return fail('How much did you use? Say a number or a fraction, like half.');
    const problem = spread(line.action, amount, pool, verb);
    if (problem) return fail(problem);
  } else if (line.action === 'freeze') {
    const open = pool.filter((b) => !b.frozen && !b.thawed);
    if (open.length === 0) return fail(pool.some((b) => b.thawed) ? `What is left of ${name} was thawed, and thawed food is never frozen again: use it soon.` : `Nothing of ${name} is outside the freezer.`);
    const problem = spread('freeze', quantity ?? open[0].quantity, open, 'Freeze');
    if (problem) return fail(problem);
  } else if (line.action === 'thaw') {
    const frozen = pool.filter((b) => b.frozen);
    if (frozen.length === 0) return fail(`Nothing of ${name} is frozen.`);
    const problem = spread('thaw', quantity ?? frozen[0].quantity, frozen, 'Take out');
    if (problem) return fail(problem);
  } else if (line.action === 'finish') {
    if (all.length === 0) return fail(`None of ${name} is in stock.`);
    const b = pool[0];
    steps.push({ text: `Finish ${name}${all.length > 1 ? ' (one batch)' : ''}`, batch: batchText(e, b), event: make('count', 0, b) });
  } else {
    // some_left: the pack in use is what is left, so it is a use of the difference.
    const a = line.amount;
    if (e.product.packSize) return fail(`${name} comes in packs of ${e.product.packSize} and is counted in single items, so there is no "part left". Say how many items you used.`);
    if (a?.kind !== 'fraction') return fail('How much is left? Say half, a quarter, or almost gone.');
    const used = Math.round((e.stock.quantity - partLeft(e.stock.quantity, e.product.unit, a.value)) * 1000) / 1000;
    if (used <= 0) return fail(`${name} is already at or below that level.`);
    steps.push({ text: `${a.text} of ${name} left (uses ${label(e, used)})`, event: make('use', used) });
  }

  // A count that is newer than the day swallows this event: the stock is replayed by date.
  const swallowed = events.find((x) => x.productId === e.product.id && x.type === 'count' && x.date > date);
  if (swallowed) warnings.push(`You counted ${name} on ${shortDate(swallowed.date)}, after this day. That count already covers it, so the stock will not change.`);
  const first = steps[0]?.event.batch ? all.find((b) => b.id === steps[0].event.batch) : undefined;
  if (first && purchaseDateOf(e, first) > date) warnings.push(`Dated before it was bought (${shortDate(purchaseDateOf(e, first))}).`);
  return { steps, warnings };
}
