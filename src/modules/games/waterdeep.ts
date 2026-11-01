import type { GameTitle, Match } from './types';

export const isWaterdeep = (title?: Pick<GameTitle, 'name'>): boolean => !!title && /waterdeep/i.test(title.name);

/** Suggestions for the Lord field (free text, so anything else can still be typed): the base game, then Undermountain, then Skullport. */
export const WATERDEEP_LORDS = [
  'Brianne Byndraeth',
  'Caladorn Cassalanter',
  'Durnan the Wanderer',
  'Khelben Arunsun',
  'Kyriani Agrivar',
  'Larissa Neathal',
  'Mirt the Moneylender',
  'Nindil Jalbuck',
  'Nymara Scheiron',
  'Piergeiron the Paladinson',
  'Sammereza Sulphontis',
  'Danilo Thann',
  'Halaster Blackcloak',
  'Trobriand',
  'Irusyl Eraneth',
  'The Xanathar',
  'Sangalor',
] as const;

/** Extra details for a Lords of Waterdeep game, kept on the match. The match score is the final total, after the Lord's bonus. */
export interface WaterdeepInfo {
  /** Secret Lord per player id, revealed at the end. */
  lords?: Record<string, string>;
  /** Points per player id just before the Lord's bonus was added. */
  before?: Record<string, number>;
  /** Played with the Skullport expansion: corruption is tracked. */
  skullport?: boolean;
  /** Points each corruption is worth (as entered, e.g. -5), the same for every player. */
  corruptionValue?: number;
  /** How many corruptions each player ended with, by player id. */
  corruptions?: Record<string, number>;
  /** Older games: the value of each corruption per player (the count is the length). Still read by the stats. */
  corruption?: Record<string, number[]>;
}

/** A player's corruptions in a game: how many, and the points they are worth. */
export function playerCorruption(info: WaterdeepInfo | undefined, id: string): { count: number; points: number } {
  const n = info?.corruptions?.[id];
  if (n !== undefined) return { count: n, points: n * (info?.corruptionValue ?? 0) };
  const list = info?.corruption?.[id] ?? [];
  return { count: list.length, points: list.reduce((a, b) => a + b, 0) };
}

/** Drop empty entries and players who are not in the game; undefined when nothing is left. */
export function cleanWaterdeep(info: WaterdeepInfo, playerIds: string[]): WaterdeepInfo | undefined {
  const lords: Record<string, string> = {};
  const before: Record<string, number> = {};
  for (const id of playerIds) {
    const l = info.lords?.[id]?.trim();
    if (l) lords[id] = l;
    const b = info.before?.[id];
    if (typeof b === 'number' && Number.isFinite(b)) before[id] = b;
  }
  const corruption: Record<string, number[]> = {};
  for (const id of playerIds) {
    const c = (info.corruption?.[id] ?? []).filter((n) => typeof n === 'number' && Number.isFinite(n));
    if (c.length) corruption[id] = c;
  }
  const corruptions: Record<string, number> = {};
  for (const id of playerIds) {
    const n = info.corruptions?.[id];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) corruptions[id] = n;
  }
  const out: WaterdeepInfo = {
    lords: Object.keys(lords).length ? lords : undefined,
    before: Object.keys(before).length ? before : undefined,
    skullport: info.skullport || undefined,
    corruption: Object.keys(corruption).length ? corruption : undefined,
    corruptionValue: info.skullport && typeof info.corruptionValue === 'number' && Number.isFinite(info.corruptionValue) ? info.corruptionValue : undefined,
    corruptions: Object.keys(corruptions).length ? corruptions : undefined,
  };
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}

/** Points the Lord added: final score minus the score before it. Undefined unless both are known. */
export function lordBonus(before: number | undefined, after: number | undefined): number | undefined {
  return before === undefined || after === undefined ? undefined : after - before;
}

export interface LordStat {
  lord: string;
  games: number;
  wins: number;
  /** Games where the before-score was recorded too. */
  bonusGames: number;
  /** Average points the Lord added, over `bonusGames`. */
  avgBonus?: number;
  /** Games where the Lord's bonus decided the win: leading after it but not before. */
  turnarounds: number;
}

/** Per Lord, over finished matches: games, wins, and the average bonus. */
export function lordStats(matches: Pick<Match, 'waterdeep' | 'winnerIds' | 'live' | 'scores' | 'playerIds'>[]): LordStat[] {
  const out = new Map<string, LordStat & { sum: number }>();
  for (const m of matches) {
    const lords = m.waterdeep?.lords;
    if (m.live || !lords) continue;
    const before = m.waterdeep?.before ?? {};
    const topBefore = Math.max(...Object.values(before), -Infinity);
    for (const id of m.playerIds) {
      const lord = lords[id];
      if (!lord) continue;
      const s = out.get(lord) ?? { lord, games: 0, wins: 0, bonusGames: 0, turnarounds: 0, sum: 0 };
      out.set(lord, s);
      s.games++;
      const won = m.winnerIds.includes(id);
      if (won) s.wins++;
      const bonus = lordBonus(before[id], m.scores[id]);
      if (bonus !== undefined) {
        s.bonusGames++;
        s.sum += bonus;
        // Won, and was not already ahead of (or level with) everyone before the Lord.
        if (won && before[id] < topBefore) s.turnarounds++;
      }
    }
  }
  return [...out.values()]
    .map(({ sum, ...s }) => ({ ...s, avgBonus: s.bonusGames ? sum / s.bonusGames : undefined }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.lord.localeCompare(b.lord));
}

export interface CorruptionStat {
  id: string;
  /** Finished expansion games they played. */
  games: number;
  wins: number;
  /** Corruptions across those games. */
  count: number;
  /** Sum of their values across those games. */
  points: number;
}

/** Corruption per player, over finished games played with the Skullport expansion. */
export function corruptionStats(matches: Pick<Match, 'waterdeep' | 'winnerIds' | 'live' | 'playerIds'>[]): CorruptionStat[] {
  const out = new Map<string, CorruptionStat>();
  for (const m of matches) {
    if (m.live || !m.waterdeep?.skullport) continue;
    for (const id of m.playerIds) {
      const s = out.get(id) ?? { id, games: 0, wins: 0, count: 0, points: 0 };
      out.set(id, s);
      const c = playerCorruption(m.waterdeep, id);
      s.games++;
      if (m.winnerIds.includes(id)) s.wins++;
      s.count += c.count;
      s.points += c.points;
    }
  }
  return [...out.values()].sort((a, b) => b.count / b.games - a.count / a.games || a.id.localeCompare(b.id));
}

/** Short mark for a Lord: the capitals of its name ("Caladorn Cassalanter" → CC), or the first two letters when it is one word ("Trobriand" → Tr). "The" is skipped. */
export function lordInitials(lord?: string): string {
  const words = (lord ?? '').trim().split(/\s+/).filter((w) => w && !/^the$/i.test(w));
  const caps = words.filter((w) => /^\p{Lu}/u.test(w)).map((w) => w[0]);
  if (caps.length >= 2) return caps.slice(0, 3).join('');
  const w = words[0] ?? '';
  return w.length > 1 ? w[0].toUpperCase() + w[1].toLowerCase() : w.toUpperCase();
}
