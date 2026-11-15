// Changing a book by hand, and adding one: pure helpers (the screens call them and save the result).

import type { BookHit } from '../../../worker/bookHit';
import type { Book, Shelf } from './types';

export type Patch = Partial<Pick<Book, 'shelf' | 'rating' | 'dateRead' | 'readCount'>>;

/**
 * The book with `patch` applied (a key set to undefined is removed). On a Goodreads book the changed fields are listed in
 * `edited`, so the next import leaves them alone; a book you added yourself has no one to disagree with.
 */
export function edit(b: Book, patch: Patch, now: string): Book {
  const next: Book = { ...b, updatedAt: now };
  for (const [key, value] of Object.entries(patch) as [keyof Patch, unknown][]) {
    if (value === undefined) delete next[key];
    else (next as unknown as Record<string, unknown>)[key] = value;
  }
  if (b.source === 'goodreads') next.edited = [...new Set([...(b.edited ?? []), ...Object.keys(patch)])];
  return next;
}

/** Moves a book to a shelf. Read gets today as its finish date when it has none; any other shelf drops a finish date, so it leaves the calendar. */
export function moveToShelf(b: Book, shelf: Shelf, day: string, now: string): Book {
  if (b.shelf === shelf) return b;
  const patch: Patch = { shelf };
  if (shelf === 'read' && !b.dateRead) patch.dateRead = day;
  if (shelf !== 'read' && b.dateRead) patch.dateRead = undefined;
  return edit(b, patch, now);
}

/** Your rating, 1–5; the rating it already has takes it away. */
export function rate(b: Book, rating: number, now: string): Book {
  const stars = Math.round(rating);
  if (stars < 1 || stars > 5) return b;
  return edit(b, { rating: b.rating === stars ? undefined : stars }, now);
}

/** The day you finished it (only for a read book, and never in the future). */
export function setFinished(b: Book, date: string, day: string, now: string): Book {
  if (b.shelf !== 'read' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > day || date === b.dateRead) return b;
  return edit(b, { dateRead: date }, now);
}

/** A book from a search result, ready to save: id `ol-<work>`, so the same work is never added twice. */
export function bookFromHit(hit: BookHit, shelf: Shelf, day: string, now: string): Book {
  const book: Book = {
    id: `ol-${hit.key}`,
    title: hit.title,
    author: hit.author,
    coAuthors: hit.coAuthors,
    isbn: hit.isbn,
    isbn13: hit.isbn13,
    pages: hit.pages,
    originalYear: hit.year,
    shelf,
    dateAdded: day,
    dateRead: shelf === 'read' ? day : undefined,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
  for (const k of Object.keys(book) as (keyof Book)[]) if (book[k] === undefined) delete book[k];
  return book;
}

/** A book typed in by hand (not found in the search): the caller gives it a fresh id. */
export function typedBook(id: string, title: string, author: string, shelf: Shelf, day: string, now: string): Book | null {
  const t = title.trim();
  if (!t) return null;
  const book: Book = { id: `book-${id}`, title: t, author: author.trim() || 'Unknown author', shelf, dateAdded: day, source: 'manual', createdAt: now, updatedAt: now };
  if (shelf === 'read') book.dateRead = day;
  return book;
}
