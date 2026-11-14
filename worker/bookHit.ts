/** One result of the book search (Open Library), shared by the Worker and the app (no Worker imports here). */
export interface BookHit {
  /** Open Library's work id, e.g. `OL893415W`. */
  key: string;
  title: string;
  author: string;
  coAuthors?: string[];
  /** First publication year. */
  year?: number;
  pages?: number;
  isbn13?: string;
  isbn?: string;
  /** Open Library's cover id: `GET /api/books/cover?id=<coverId>` gives the picture. */
  coverId?: number;
}
