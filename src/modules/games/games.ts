import type { GameNight, GameTitle, Match, ScoreRule } from './types';

/** Who the scores say won: the top (or bottom) score, everyone on a tie. Empty when there are no scores or the rule is manual. */
export function winnersFromScores(rule: ScoreRule, scores: Record<string, number>, playerIds: string[]): string[] {
  if (rule === 'manual') return [];
  const scored = playerIds.filter((id) => Number.isFinite(scores[id]));
  if (scored.length === 0) return [];
  const best = rule === 'high' ? Math.max(...scored.map((id) => scores[id])) : Math.min(...scored.map((id) => scores[id]));
  return scored.filter((id) => scores[id] === best);
}

/** Every match with its night, oldest first (by date, then the order they were played). */
export interface PlayedMatch extends Match {
  date: string;
  nightId: string;
}
export function allMatches(nights: GameNight[]): PlayedMatch[] {
  return [...nights]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .flatMap((n) => n.matches.filter((m) => !m.live).map((m) => ({ ...m, date: n.date, nightId: n.id })));
}

export interface PlayerRecord {
  id: string;
  played: number;
  wins: number;
  /** 0–1 */
  winRate: number;
  /** Wins in a row ending with their latest game (0 after a loss). */
  streak: number;
  bestStreak: number;
}

/** Wins, win rate and streaks per player, over games they played in. Optionally limited to one game. */
export function playerRecords(nights: GameNight[], titleId?: string): PlayerRecord[] {
  const byId = new Map<string, PlayerRecord>();
  for (const m of allMatches(nights)) {
    if (titleId && m.titleId !== titleId) continue;
    for (const id of m.playerIds) {
      const r = byId.get(id) ?? { id, played: 0, wins: 0, winRate: 0, streak: 0, bestStreak: 0 };
      r.played += 1;
      if (m.winnerIds.includes(id)) {
        r.wins += 1;
        r.streak += 1;
        r.bestStreak = Math.max(r.bestStreak, r.streak);
      } else {
        r.streak = 0;
      }
      byId.set(id, r);
    }
  }
  for (const r of byId.values()) r.winRate = r.played ? r.wins / r.played : 0;
  return [...byId.values()].sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.played - b.played);
}

/** Games both played; wins for each (a shared win counts for both). */
export function headToHead(nights: GameNight[], a: string, b: string): { games: number; aWins: number; bWins: number } {
  const out = { games: 0, aWins: 0, bWins: 0 };
  for (const m of allMatches(nights)) {
    if (!m.playerIds.includes(a) || !m.playerIds.includes(b)) continue;
    out.games += 1;
    if (m.winnerIds.includes(a)) out.aWins += 1;
    if (m.winnerIds.includes(b)) out.bWins += 1;
  }
  return out;
}

export interface TitleStats {
  id: string;
  plays: number;
  lastPlayed: string;
  /** Who won most, with their wins. */
  topWinner?: { playerId: string; wins: number };
  /** Best score by the game's rule, with who got it and when. */
  bestScore?: { value: number; playerId: string; date: string };
}

export function titleStats(nights: GameNight[], titles: GameTitle[]): TitleStats[] {
  const ruleOf = new Map(titles.map((t) => [t.id, t.rule]));
  const out = new Map<string, TitleStats>();
  const wins = new Map<string, Map<string, number>>();
  for (const m of allMatches(nights)) {
    const s = out.get(m.titleId) ?? { id: m.titleId, plays: 0, lastPlayed: m.date };
    s.plays += 1;
    s.lastPlayed = m.date;
    const w = wins.get(m.titleId) ?? new Map<string, number>();
    for (const id of m.winnerIds) w.set(id, (w.get(id) ?? 0) + 1);
    wins.set(m.titleId, w);
    const rule = ruleOf.get(m.titleId) ?? 'high';
    for (const [playerId, value] of Object.entries(m.scores)) {
      if (!Number.isFinite(value)) continue;
      const cur = s.bestScore;
      const better = !cur || (rule === 'low' ? value < cur.value : value > cur.value);
      if (better) s.bestScore = { value, playerId, date: m.date };
    }
    out.set(m.titleId, s);
  }
  for (const [titleId, w] of wins) {
    const top = [...w.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) out.get(titleId)!.topWinner = { playerId: top[0], wins: top[1] };
  }
  return [...out.values()].sort((a, b) => b.plays - a.plays || b.lastPlayed.localeCompare(a.lastPlayed));
}

/** Games played per month (YYYY-MM), for the last `count` months ending at `now` (YYYY-MM-DD). */
export function playsPerMonth(nights: GameNight[], now: string, count = 6): { month: string; plays: number }[] {
  let [y, m] = now.slice(0, 7).split('-').map(Number);
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    months.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  const counts = new Map<string, number>();
  for (const n of nights) counts.set(n.date.slice(0, 7), (counts.get(n.date.slice(0, 7)) ?? 0) + n.matches.filter((m) => !m.live).length);
  return months.map((month) => ({ month, plays: counts.get(month) ?? 0 }));
}

/** The player with the most wins on a night (ties: none), for the list. */
export function nightChampion(night: GameNight): { playerId: string; wins: number } | undefined {
  const w = new Map<string, number>();
  for (const m of night.matches) for (const id of m.winnerIds) w.set(id, (w.get(id) ?? 0) + 1);
  const sorted = [...w.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || (sorted[1] && sorted[1][1] === sorted[0][1])) return undefined;
  return { playerId: sorted[0][0], wins: sorted[0][1] };
}

/** Total points per player over the rounds so far (blank cells count as 0). */
export function roundTotals(rounds: Record<string, number>[], playerIds: string[]): Record<string, number> {
  return Object.fromEntries(playerIds.map((id) => [id, rounds.reduce((sum, r) => sum + (Number.isFinite(r[id]) ? r[id] : 0), 0)]));
}

export interface Standing {
  id: string;
  total: number;
  /** 1-based; players on the same total share a position (1, 1, 3). */
  position: number;
  /** Points scored in the latest round, if it has any for this player. */
  last?: number;
  /** Points behind the leader (always >= 0, by the game's rule). */
  behind: number;
  /** The player right above on the board, and the points to catch up to them (0 when level). */
  above?: { id: string; gap: number };
  /** Points per round so far (blank = 0). */
  trail: number[];
}

/** The scoreboard: players ordered by total (lowest first for "low" games), with their position and recent points. */
export function standings(rounds: Record<string, number>[], playerIds: string[], rule: ScoreRule): Standing[] {
  const totals = roundTotals(rounds, playerIds);
  const sign = rule === 'low' ? 1 : -1;
  const order = [...playerIds].sort((a, b) => sign * (totals[a] - totals[b]) || playerIds.indexOf(a) - playerIds.indexOf(b));
  const leader = order.length ? totals[order[0]] : 0;
  const lastRound = rounds[rounds.length - 1];
  return order.map((id, i) => ({
    id,
    above: i > 0 ? { id: order[i - 1], gap: Math.abs(totals[order[i - 1]] - totals[id]) } : undefined,
    total: totals[id],
    position: order.findIndex((o) => totals[o] === totals[id]) + 1,
    last: lastRound && Number.isFinite(lastRound[id]) ? lastRound[id] : undefined,
    behind: Math.abs(leader - totals[id]),
    trail: rounds.map((r) => (Number.isFinite(r[id]) ? r[id] : 0)),
  }));
}
