/** Where a book is on your shelves. Goodreads' own three, plus `other` for a custom exclusive shelf (the name is kept in `shelves`). */
export type Shelf = 'read' | 'currently-reading' | 'to-read' | 'other';

/**
 * One book from your Goodreads export. id = `gr-<Goodreads Book Id>`, so importing the same file again never doubles a book.
 * Goodreads is the source of everything here; nothing is edited in the app yet.
 */
export interface Book {
  id: string;
  title: string;
  /** The main author, as Goodreads prints it ("Frank Herbert"). */
  author: string;
  coAuthors?: string[];
  isbn?: string;
  isbn13?: string;
  /** Your rating, 1–5; missing = not rated (Goodreads exports 0). */
  rating?: number;
  /** Goodreads' average rating. */
  avgRating?: number;
  publisher?: string;
  binding?: string;
  pages?: number;
  /** Year of this edition, and of the first publication. */
  year?: number;
  originalYear?: number;
  /** Local YYYY-MM-DD; a read book may have none, and then it is never given one. */
  dateRead?: string;
  dateAdded?: string;
  shelf: Shelf;
  /** Your own shelves (tags), without the exclusive one. */
  shelves?: string[];
  review?: string;
  /** Times you read it, when Goodreads says more than one. */
  readCount?: number;
  source: 'goodreads';
  createdAt: string;
  updatedAt: string;
}
