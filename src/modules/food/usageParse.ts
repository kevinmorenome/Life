import { normalizeKey } from './products';
import { addDays } from './stock';
import type { Entry } from './stockEntries';

/** What a sentence like "used half the pesto" says should happen to a product: the same actions as the MCP `use_stock` tool. */
export type UsageAction = 'use' | 'some_left' | 'finish' | 'toss' | 'freeze' | 'thaw';

/** An amount as it was said, not yet tied to a product's unit. */
export type Amount =
  | { kind: 'count'; value: number } // "two", "1.5"
  | { kind: 'fraction'; value: number; text: string } // "half", "a quarter"
  | { kind: 'measure'; value: number; unit: 'g' | 'kg' | 'ml' | 'cl' | 'dl' | 'l' }; // "200 g"

export interface UsageLine {
  /** The part of the sentence this line comes from. */
  clause: string;
  action: UsageAction;
  /** What is left of the clause once the verb, amount and date are taken out: the words that name the product. */
  words: string[];
  amount?: Amount;
  /** Product ids that fit the words and are in stock (several: the user picks one). */
  candidates: string[];
  /** YYYY-MM-DD, the real calendar date. */
  date: string;
  /** The user said it should not count in the statistics ("just catching up"). */
  notInStats: boolean;
  /** The date, amount or action is missing or unclear: nothing is logged until it is answered (one short question). */
  question?: string;
  /** No product in stock fits the words (why, in a sentence). Several fitting products are not a problem: the user picks. */
  unknownProduct?: string;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_SHORT: Record<string, number> = { mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5 };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const dayOfWeek = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();
const num = (s: string): number => NUMBER_WORDS[s] ?? Number(s.replace(',', '.'));
const pad = (n: number) => String(n).padStart(2, '0');

export interface DatePhrase {
  /** The real date, or undefined when the phrase is too vague. */
  date?: string;
  /** "last week", "a while ago": say which day. */
  vague?: boolean;
  /** The text that was the date, to take out of the clause. */
  match: string;
}

/**
 * Finds a date in the user's own words and works out the calendar date from `today`. A weekday means the most recent one
 * that already happened (the same weekday as today is a week ago: only "today" means today). Anything vague is flagged, never guessed.
 */
export function findDate(text: string, today: string): DatePhrase | undefined {
  const t = text.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b\d{4}-\d{2}-\d{2}\b/))) return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(m[0]) && m[0] <= today ? { date: m[0], match: m[0] } : { vague: true, match: m[0] };
  if ((m = t.match(/\b(the )?day before yesterday\b/))) return { date: addDays(today, -2), match: m[0] };
  if ((m = t.match(/\b(yesterday|last night)\b/))) return { date: addDays(today, -1), match: m[0] };
  if ((m = t.match(/\b(today|this morning|this afternoon|this evening|tonight)\b/))) return { date: today, match: m[0] };
  if ((m = t.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|days|week|weeks)\s+ago\b/))) {
    const n = m[1] === 'a' || m[1] === 'an' ? 1 : num(m[1]);
    return { date: addDays(today, -n * (m[2].startsWith('week') ? 7 : 1)), match: m[0] };
  }
  if ((m = t.match(/\b(last week|this week|earlier this week|the other day|a few days ago|a couple of days ago|a couple days ago|a while ago|recently|some days ago|the weekend|last weekend)\b/))) return { vague: true, match: m[0] };
  const day = `(\\d{1,2})(?:st|nd|rd|th)?`;
  const dm = t.match(new RegExp(`\\b${day}\\s+(?:of\\s+)?${MONTH_RE}\\b`)) ?? t.match(new RegExp(`\\b${MONTH_RE}\\s+${day}\\b`));
  if (dm) {
    const dayNo = Number(/^\d/.test(dm[1]) ? dm[1] : dm[2]);
    const monthName = /^\d/.test(dm[1]) ? dm[2] : dm[1];
    const month = MONTHS.findIndex((x) => x.startsWith(monthName.slice(0, 3)));
    let year = Number(today.slice(0, 4));
    let date = `${year}-${pad(month + 1)}-${pad(dayNo)}`;
    if (date > today) date = `${--year}-${pad(month + 1)}-${pad(dayNo)}`;
    const real = new Date(`${date}T00:00:00Z`);
    return real.getUTCMonth() === month && real.getUTCDate() === dayNo ? { date, match: dm[0] } : { vague: true, match: dm[0] };
  }
  const wd = t.match(new RegExp(`\\b(?:(?:on|last|this past)\\s+)?(${WEEKDAYS.join('|')})\\b`)) ?? t.match(new RegExp(`\\b(?:on|last)\\s+(${Object.keys(WEEKDAY_SHORT).join('|')})\\b`));
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1]) >= 0 ? WEEKDAYS.indexOf(wd[1]) : WEEKDAY_SHORT[wd[1]];
    const back = (dayOfWeek(today) - target + 7) % 7 || 7;
    return { date: addDays(today, -back), match: wd[0] };
  }
  return undefined;
}

/** Splits an amount out of a clause. Fractions of a thing ("half the pesto") and counts ("one chicken breast") are told apart from measures ("200 g"). */
function takeAmount(clause: string): { rest: string; amount?: Amount; vague: boolean } {
  let rest = clause;
  const vague = /\b(a bit|a little|a lot|a few|a couple|a handful|some)\b(?! left)/.test(rest);
  rest = rest.replace(/\b(a bit|a little|a lot|a few|a couple|a handful)( of)?\b/g, ' ');
  let m: RegExpMatchArray | null;
  if ((m = rest.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l)\b/))) return { rest: rest.replace(m[0], ' '), amount: { kind: 'measure', value: num(m[1]), unit: m[2] as 'g' }, vague };
  const fractions: [RegExp, number, string][] = [
    [/\b(three quarters?|3\/4)\b/, 0.75, 'three quarters'],
    [/\b(a quarter|quarter|1\/4)\b/, 0.25, 'a quarter'],
    [/\b(a third|third|1\/3)\b/, 1 / 3, 'a third'],
    [/\b(half|a half|1\/2)\b/, 0.5, 'half'],
  ];
  for (const [re, value, text] of fractions) {
    if ((m = rest.match(re))) return { rest: rest.replace(m[0], ' '), amount: { kind: 'fraction', value: Math.round(value * 1000) / 1000, text }, vague };
  }
  if ((m = rest.match(/\b(\d+(?:[.,]\d+)?)\b/))) return { rest: rest.replace(m[0], ' '), amount: { kind: 'count', value: num(m[1]) }, vague };
  if ((m = rest.match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`)))) return { rest: rest.replace(m[0], ' '), amount: { kind: 'count', value: NUMBER_WORDS[m[1]] }, vague };
  if (!vague && (m = rest.match(/\b(a|an)\s+(?=[a-z])/))) return { rest: rest.replace(m[0], ' '), amount: { kind: 'count', value: 1 }, vague };
  return { rest, vague };
}

const STOP = new Set(
  ('i me my we the of a an some today yesterday just also it its that this those these to in on from with for is was were are been be about almost all up out off away into already earlier left remaining gone ' +
    'only still then ago day days week last night morning afternoon evening bit lot few couple and or but so please pack packs packet packets jar jars bottle bottles can cans bag bags piece pieces slice slices portion portions box boxes tin tins ' +
    'used use using ate eat eaten had have has cooked cook drank drink consumed made opened froze freeze frozen freezer thawed thaw defrosted defrost threw throw thrown tossed toss binned bin discarded wasted finished finish catching not stats statistics count doesnt dont does did do').split(' '),
);

interface Verb {
  action: UsageAction;
  re: RegExp;
}
// Order matters: freezing and throwing out win over a plain "used".
const VERBS: Verb[] = [
  { action: 'thaw', re: /\b(thawed|thaw|defrosted|defrost|took\b.*\bout of the freezer)\b/ },
  { action: 'freeze', re: /\b(froze|freeze|freezed|put\b.*\b(in|into) the freezer)\b/ },
  { action: 'toss', re: /\b(threw|throw|thrown|tossed|toss|binned|bin|discarded|chucked|wasted)\b/ },
  { action: 'finish', re: /\b(finished|finish|ran out of|run out of|used (it )?(all|up)|used up|all gone|polished off|ate (it )?all|used all|ate all)\b/ },
  { action: 'use', re: /\b(used|use|ate|eat|eaten|had|cooked|cook|drank|drink|consumed|opened|made)\b/ },
];

const NOT_IN_STATS = /\b(already (used|ate|eaten|finished|threw|thrown)|just catching up|catching up|not in (the )?(stats|statistics)|doesn'?t count|don'?t count|shouldn'?t count)\b/;

const stem = (w: string): string => w.replace(/ies$/, 'y').replace(/(es|s)$/, '');
const nameWords = (name: string): string[] => normalizeKey(name).split(' ').filter(Boolean);
const wordFits = (word: string, names: string[]): boolean => {
  const s = stem(word);
  return names.some((n) => n.startsWith(word) || (s.length >= 3 && n.startsWith(s)));
};

/** The products in stock (or, for thawing, with something frozen) that every word names; one exact name wins over longer ones. */
export function findProducts(words: string[], entries: Entry[], action: UsageAction): Entry[] {
  const key = words.map(normalizeKey).filter(Boolean);
  if (key.length === 0) return [];
  const usable = entries.filter((e) => (action === 'thaw' ? e.stock.frozenQuantity > 0 : e.stock.quantity > 0));
  const hits = usable.filter((e) => {
    const names = nameWords(e.product.name);
    return key.every((w) => wordFits(w, names));
  });
  const exact = hits.filter((e) => normalizeKey(e.product.name) === key.join(' '));
  return exact.length === 1 ? exact : hits;
}

/**
 * Reads a sentence such as "Today I used half of the pesto and one chicken breast" into one line per product, each with
 * the action, amount, real date and the products it could mean. It never guesses: a missing amount, a vague date or an
 * unknown product becomes a `question` instead.
 */
export function parseUsage(sentence: string, entries: Entry[], today: string): UsageLine[] {
  let text = sentence.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const notInStats = NOT_IN_STATS.test(text);
  // "one and a half" is one amount, so it must not be split at "and".
  text = text.replace(/\b(\d+|one|two|three|four|five)\s+and\s+a\s+half\b/g, (_m, n) => ` ${num(n) + 0.5} `);
  const clauses = text.split(/\s*(?:,|;|\.(?=\s|$)|!|\band then\b|\bthen\b|\band\b|\bplus\b)\s*/).filter((c) => c.trim());

  // One date phrase in the whole sentence is the date of every clause that has none of its own.
  const dates = clauses.map((c) => findDate(c, today));
  const distinct = new Set(dates.filter((d): d is DatePhrase => !!d).map((d) => (d.vague ? `vague:${d.match}` : d.date)));
  const shared = distinct.size === 1 ? dates.find((d): d is DatePhrase => !!d) : undefined;

  const lines: UsageLine[] = [];
  let lastAction: UsageAction | undefined;
  clauses.forEach((clause, i) => {
    let c = clause;
    const own = dates[i];
    if (own) c = c.replace(own.match, ' ');
    // "earlier" is the user saying it is catching up, not a date, when they also say it should not count.
    const when = own ?? shared;
    const dateQuestion = when?.vague && !(notInStats && /\bearlier\b/.test(clause)) ? `Which day was that? "${when.match}" is too vague.` : undefined;

    let action = VERBS.find((v) => v.re.test(c))?.action;
    const amountPart = takeAmount(c);
    let amount = amountPart.amount;
    const saysLeft = /\b(left|remaining)\b/.test(c) || /\balmost gone\b/.test(c);
    if (!action && saysLeft && (amount?.kind === 'fraction' || /\balmost gone\b/.test(c))) action = 'some_left';
    if (action === 'use' && saysLeft && amount?.kind === 'fraction') action = 'some_left';
    if (/\balmost gone\b/.test(c) && !amount) amount = { kind: 'fraction', value: 0.1, text: 'almost gone' };
    if (action) lastAction = action;
    const effective = action ?? lastAction;

    const words = amountPart.rest
      .split(/[^a-z0-9À-ɏ]+/)
      .filter((w) => w && !STOP.has(w) && !(w in NUMBER_WORDS));
    if (words.length === 0 && !effective) return; // nothing but a date or filler

    const found = effective ? findProducts(words, entries, effective) : [];
    let question = dateQuestion;
    if (!question && !effective) question = 'Did you use it, freeze it, or throw it out?';
    if (!question && amountPart.vague && !amount) question = 'How much exactly? Say a number or a fraction, like half.';
    let unknownProduct: string | undefined;
    if (words.length === 0) unknownProduct = 'Which product?';
    else if (found.length === 0) {
      const gone = entries.filter((e) => key(words).every((w) => wordFits(w, nameWords(e.product.name))));
      unknownProduct = gone.length > 0 ? `${gone.map((e) => e.product.name).join(' / ')} ${effective === 'thaw' ? 'has nothing frozen' : 'is not in stock'}.` : `I can't find "${words.join(' ')}" in your stock.`;
    }
    lines.push({
      clause: clause.trim(),
      action: effective ?? 'use',
      words,
      amount,
      candidates: found.map((e) => e.product.id),
      date: when?.date ?? today,
      notInStats,
      question,
      unknownProduct,
    });
  });
  return lines;
}

const key = (words: string[]): string[] => words.map(normalizeKey).filter(Boolean);
