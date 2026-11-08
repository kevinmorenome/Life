import { normalizeKey } from './products';
import type { ProductType, Unit } from './types';

/** The drawn pictures used on a tile until a product has a real photo. */
export const ICON_KINDS = ['chicken', 'cucumber', 'pepper', 'carrot', 'jar', 'pasta', 'milk', 'can', 'chips', 'nuts', 'spice', 'oil', 'box', 'bottle'] as const;
export type IconKind = (typeof ICON_KINDS)[number];

/** Keywords per picture, tried in this order (so "smoked paprika" is a spice and "paprika mix" a pepper). English and Croatian. */
const RULES: [IconKind, string[]][] = [
  ['bottle', ['shampoo', 'sampon', 'conditioner', 'regenerator', 'balzam', 'soap', 'sapun', 'lotion', 'losion', 'mask', 'maska', 'krema', 'deodorant', 'dezodorans', 'detergent', 'toothpaste', 'zubna', 'gel', 'serum', 'omeksivac']],
  ['can', ['beer', 'pivo', 'cider', 'somersby', 'lager', 'ale', 'wine', 'vino', 'staropramen', 'radler']],
  ['pasta', ['pasta', 'tortellini', 'noodle', 'spaghetti', 'penne', 'gnocchi', 'ravioli', 'macaroni', 'tjestenina']],
  ['spice', ['salt', 'sol', 'spice', 'cinnamon', 'cumin', 'oregano', 'smoked', 'ground', 'powder', 'seasoning', 'herb', 'vegeta', 'curry']],
  ['jar', ['hummus', 'jam', 'spread', 'honey', 'med', 'pesto', 'butter', 'namaz', 'pickle', 'ajvar']],
  ['milk', ['milk', 'mlijeko', 'drink', 'juice', 'sok', 'yoghurt', 'yogurt', 'jogurt', 'kefir', 'cream', 'vrhnje']],
  ['chips', ['chip', 'crisp', 'cips', 'cracker', 'snack', 'popcorn']],
  ['nuts', ['peanut', 'nut', 'almond', 'kikiriki', 'walnut', 'cashew']],
  ['oil', ['oil', 'ulje', 'vinegar', 'ocat']],
  ['chicken', ['chicken', 'fillet', 'file', 'piletina', 'pork', 'beef', 'steak', 'meat', 'sausage', 'bacon', 'ham', 'turkey', 'mince']],
  ['cucumber', ['cucumber', 'krastavac', 'zucchini', 'courgette', 'celery']],
  ['carrot', ['carrot', 'mrkva', 'parsnip']],
  ['pepper', ['paprika', 'pepper', 'capsicum', 'tomato', 'rajcica']],
];

/** Which drawn picture suits a product, from its name (words, ignoring case, accents and a plural s), else from its type. */
export function iconKind(name: string, type: ProductType, unit: Unit): IconKind {
  const words = new Set(normalizeKey(name).split(' ').flatMap((w) => [w, w.replace(/s$/, '')]));
  for (const [kind, keywords] of RULES) if (keywords.some((k) => words.has(k))) return kind;
  if (type === 'drink') return 'can';
  if (type === 'snack') return 'chips';
  return unit === 'kg' ? 'cucumber' : 'box';
}
