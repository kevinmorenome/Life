/** One play from Trakt: a movie, or one episode of a show. Pulled by the Worker, never edited in the app. id = `trakt-<history id>`. */
export interface Play {
  id: string;
  kind: 'movie' | 'episode';
  /** The movie's title, or the show's for an episode. */
  title: string;
  year?: number;
  season?: number;
  number?: number;
  episodeTitle?: string;
  traktId?: number;
  slug?: string;
  /** UTC ISO; the local date and time come from `when()`. */
  at: string;
  source: 'trakt';
  createdAt: string;
  updatedAt: string;
}
