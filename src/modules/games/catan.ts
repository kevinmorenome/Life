import type { GameTitle, Match } from './types';

export const isCatan = (title?: Pick<GameTitle, 'name'>): boolean => !!title && /catan/i.test(title.name);

export const CATAN_COLORS = ['Red', 'Blue', 'Orange', 'White', 'Green', 'Brown'] as const;
export const PLAYER_COLOR_HEX: Record<string, string> = {
  Red: '#d64545',
  Blue: '#3f7be0',
  Orange: '#f0922b',
  White: '#f4f4f4',
  Green: '#3fa35b',
  Brown: '#8a5a3b',
};

/** Whether a game tracks player colors / turn order; Catan does unless its settings say otherwise. */
export const titleHasColors = (t?: Pick<GameTitle, 'name' | 'colors'>): boolean => !!t && (t.colors ?? isCatan(t));
export const titleHasOrder = (t?: Pick<GameTitle, 'name' | 'orderMatters'>): boolean => !!t && (t.orderMatters ?? isCatan(t));

export const CATAN_VARIANTS = ['Base', 'Seafarers', 'Cities & Knights', '5–6 players'] as const;
export const CATAN_ROUTES = ['Longest road', 'Largest army', 'Dev cards', 'Cities', 'Settlements', 'Mixed'] as const;

/** Extra details for a Catan game, kept on the match. */
export interface CatanInfo {
  /** Turn order per player id (1 = first). */
  seats?: Record<string, number>;
  /** Piece color per player id. */
  colors?: Record<string, string>;
  variant?: string;
  /** How the winner got to 10 points. */
  winRoute?: string;
  /** Player id who held Longest Road at the end. */
  longestRoad?: string;
  /** Player id who held Largest Army at the end. */
  largestArmy?: string;
}

/** Drop empty entries; undefined when nothing is left. */
export function cleanCatan(info: CatanInfo, playerIds: string[]): CatanInfo | undefined {
  const pick = <T,>(rec?: Record<string, T>) => {
    const out: Record<string, T> = {};
    for (const id of playerIds) if (rec?.[id] !== undefined && rec[id] !== ('' as unknown as T)) out[id] = rec[id];
    return Object.keys(out).length ? out : undefined;
  };
  const clean: CatanInfo = {
    seats: pick(info.seats),
    colors: pick(info.colors),
    variant: info.variant || undefined,
    winRoute: info.winRoute || undefined,
    longestRoad: info.longestRoad && playerIds.includes(info.longestRoad) ? info.longestRoad : undefined,
    largestArmy: info.largestArmy && playerIds.includes(info.largestArmy) ? info.largestArmy : undefined,
  };
  return Object.values(clean).some((v) => v !== undefined) ? clean : undefined;
}

/** Players in turn order: by seat, players without one after, ties keep their order. */
export function seatOrder(playerIds: string[], seats: Record<string, number> = {}): string[] {
  return playerIds
    .map((id, i) => ({ id, i }))
    .sort((a, b) => (seats[a.id] ?? Infinity) - (seats[b.id] ?? Infinity) || a.i - b.i)
    .map((x) => x.id);
}

/** Move a player to another position in the order; seats become 1..n. */
export function moveSeat(order: string[], id: string, to: number): Record<string, number> {
  const next = order.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
  return Object.fromEntries(next.map((x, i) => [x, i + 1]));
}

/** Wins and games by turn-order seat, over finished matches that recorded seats. */
export function seatStats(matches: Pick<Match, 'catan' | 'winnerIds' | 'live'>[]): Record<number, { games: number; wins: number }> {
  const out: Record<number, { games: number; wins: number }> = {};
  for (const m of matches) {
    const seats = m.catan?.seats;
    if (m.live || !seats) continue;
    for (const [id, seat] of Object.entries(seats)) {
      const s = (out[seat] ??= { games: 0, wins: 0 });
      s.games++;
      if (m.winnerIds.includes(id)) s.wins++;
    }
  }
  return out;
}

export interface BonusStat {
  id: string;
  /** Finished games they played where road or army was recorded. */
  games: number;
  road: number;
  army: number;
  /** Games won while holding it. */
  roadWins: number;
  armyWins: number;
}

/** Longest Road and Largest Army per player, over finished games that recorded either. */
export function bonusStats(matches: Pick<Match, 'catan' | 'winnerIds' | 'live' | 'playerIds'>[]): BonusStat[] {
  const out = new Map<string, BonusStat>();
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { id, games: 0, road: 0, army: 0, roadWins: 0, armyWins: 0 }));
    return s;
  };
  for (const m of matches) {
    const road = m.catan?.longestRoad;
    const army = m.catan?.largestArmy;
    if (m.live || (!road && !army)) continue;
    for (const id of m.playerIds) get(id).games++;
    const won = (id: string) => m.winnerIds.includes(id);
    if (road) {
      get(road).road++;
      if (won(road)) get(road).roadWins++;
    }
    if (army) {
      get(army).army++;
      if (won(army)) get(army).armyWins++;
    }
  }
  return [...out.values()].sort((a, b) => b.road + b.army - (a.road + a.army) || a.id.localeCompare(b.id));
}
