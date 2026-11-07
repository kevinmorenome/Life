/** One name in a day's top lists. */
export interface Ranked {
  id: number;
  name: string;
  plays: number;
  /** Tracks only: the first credited artist. */
  artist?: string;
}

/** One day of listening from stats.fm, condensed by the Worker. Rewritten when a later fetch sees the day again. id = `music-<date>`. */
export interface MusicDay {
  id: string;
  /** Local date (YYYY-MM-DD) in your stats.fm profile's time zone. */
  date: string;
  plays: number;
  /** Milliseconds played. */
  ms: number;
  /** Distinct tracks and artists that day. */
  tracks: number;
  artists: number;
  /** Plays per local hour, 24 values. */
  hours: number[];
  /** The day's five most played tracks and artists. */
  topTracks: Ranked[];
  topArtists: Ranked[];
  source: 'statsfm';
  updatedAt: string;
}
