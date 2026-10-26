export interface Swatch {
  name: string;
  /** CSS background for the dot; `null` when the name isn't a colour we know. */
  css: string | null;
}

const MULTI = 'conic-gradient(#f44, #fc3, #4c6, #39f, #a5f, #f44)';

const KNOWN: Record<string, string> = {
  black: '#111111',
  white: '#ffffff',
  grey: '#9a9ca3',
  gray: '#9a9ca3',
  beige: '#e3d3b8',
  cream: '#f5ecd5',
  brown: '#7a4b2a',
  tan: '#c8a27a',
  camel: '#c19a6b',
  red: '#e0201b',
  burgundy: '#7b1e2e',
  pink: '#f4a6c0',
  orange: '#ff9f0a',
  yellow: '#ffe600',
  gold: '#d4af37',
  green: '#2e9e4f',
  olive: '#6b7230',
  khaki: '#a89f6a',
  teal: '#1c8c8c',
  turquoise: '#30c5c5',
  blue: '#1f3cff',
  'navy blue': '#10146e',
  navy: '#10146e',
  'baby blue': '#a8d0f5',
  'light blue': '#a8d0f5',
  purple: '#8a3ffc',
  lilac: '#c8a8f0',
  silver: '#c0c0c0',
  charcoal: '#3b3d42',
  ivory: '#fffff0',
  mustard: '#d9a81e',
  coral: '#ff7a66',
  peach: '#ffc3a0',
  maroon: '#5c1020',
  mint: '#a8e6c3',
  sage: '#9caf88',
  lavender: '#d3c1f0',
  magenta: '#d6247d',
  'dark green': '#16542c',
  'light grey': '#d4d5d9',
  denim: '#3f5f8f',
  bronze: '#a9743a',
  multicolor: MULTI,
  multicolour: MULTI,
  // Spanish, as shown in the app the design is based on.
  negro: '#111111',
  blanco: '#ffffff',
  gris: '#9a9ca3',
  marrón: '#7a4b2a',
  marron: '#7a4b2a',
  rojo: '#e0201b',
  rosa: '#f4a6c0',
  naranja: '#ff9f0a',
  amarillo: '#ffe600',
  verde: '#2e9e4f',
  azul: '#1f3cff',
  'azul marino': '#10146e',
  morado: '#8a3ffc',
};

/** Colours offered by the item form's picker, in display order. */
export const PALETTE = [
  'Black', 'White', 'Grey', 'Charcoal', 'Beige', 'Cream', 'Brown', 'Tan', 'Camel',
  'Red', 'Burgundy', 'Maroon', 'Pink', 'Coral', 'Orange', 'Mustard', 'Yellow', 'Gold',
  'Green', 'Olive', 'Khaki', 'Mint', 'Teal', 'Turquoise', 'Light blue', 'Blue', 'Navy', 'Denim',
  'Purple', 'Lilac', 'Silver', 'Multicolor',
];

/** CSS background for one colour name; `null` when unknown. */
export function swatchCss(name: string): string | null {
  return KNOWN[name.trim().toLowerCase()] ?? null;
}

/** Splits a legacy free-text colour field ("Blue, Navy blue & Red") into names. */
export function splitColors(color: string | undefined): string[] {
  return (color ?? '')
    .split(/,|&|\//)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The item's colour names: the stored list, else the legacy `color` string. */
export function itemColors(item: { colors?: string[]; color?: string }): string[] {
  return item.colors ?? splitColors(item.color);
}

/** Named swatches for a list of colour names. */
export function swatches(names: string[]): Swatch[] {
  return names.map((name) => ({ name, css: swatchCss(name) }));
}

/** Splits a free-text colour field into named swatches. */
export function colorSwatches(color: string | undefined): Swatch[] {
  return swatches(splitColors(color));
}
