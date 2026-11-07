import type { GameTitle } from './types';

/** Domino games get a calculator for adding up the pips on the tiles left in a hand. */
export const isDomino = (title?: Pick<GameTitle, 'name'>): boolean => !!title && /domin/i.test(title.name);

/** The numbers a tile half can show, one calculator key each. */
export const DOMINO_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const col3 = [25, 50, 75];
const row4 = [15, 38, 62, 85];
const grid = (xs: number[], ys: number[]): [number, number][] => ys.flatMap((y) => xs.map((x) => [x, y] as [number, number]));

/** Pip positions (0-100 box) for each key: the faces of a double-twelve set. */
export const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[35, 22], [65, 22], [35, 50], [65, 50], [35, 78], [65, 78]],
  7: [[25, 22], [75, 22], [25, 50], [50, 50], [75, 50], [25, 78], [75, 78]],
  8: grid(col3, [25, 50, 75]).filter(([x, y]) => !(x === 50 && y === 50)),
  9: grid(col3, [25, 50, 75]),
  10: grid(col3, row4).filter(([x, y]) => x !== 50 || y === 15 || y === 85),
  11: [...grid(col3, [15, 38]).filter(([x, y]) => y === 15 || x !== 50), ...grid(col3, [62, 85])],
  12: grid(col3, row4),
};

/** Colour of each key's pips. */
export const KEY_COLORS: Record<number, string> = {
  1: '#4a90d9', 2: '#5fd47a', 3: '#e5473f', 4: '#b3633a', 5: '#2f6597', 6: '#ecc83f',
  7: '#9b4bb5', 8: '#58c19c', 9: '#912fa8', 10: '#eba037', 11: '#bd3329', 12: '#97a5a4',
};
