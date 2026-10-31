/** Someone who plays; reused across game nights. */
export interface Player {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** How a game's scores decide the winner. `manual`: scores (if any) are just numbers, you tap the winner. */
export type ScoreRule = 'high' | 'low' | 'manual';

export const RULE_LABELS: Record<ScoreRule, string> = {
  high: 'Highest score wins',
  low: 'Lowest score wins',
  manual: 'I pick the winner',
};

/** A board or card game you play (Catan, Uno…). */
export interface GameTitle {
  id: string;
  name: string;
  rule: ScoreRule;
  createdAt: string;
  updatedAt: string;
}

/** One game played during a night. */
export interface Match {
  id: string;
  titleId: string;
  playerIds: string[];
  /** Score per player id, for the players who have one. */
  scores: Record<string, number>;
  /** Everyone who won (more than one on a tie). Stored, so it can override what the scores say. */
  winnerIds: string[];
  note?: string;
}

/** An evening of games: where, who, and the games played in order. */
export interface GameNight {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  location?: string;
  notes?: string;
  playerIds: string[];
  matches: Match[];
  createdAt: string;
  updatedAt: string;
}
