// Pure helpers for the Books module: lists, search and the numbers for Stats. Dates are local YYYY-MM-DD strings.

import type { Book, Shelf } from './types';

export const SHELF_LABELS: Record<Shelf, string> = { read: 'Read', 'currently-reading': 'Reading', 'to-read': 'To read', other: 'Other' };

/** "Dune (Dune, #1)" → the title and its series; a title with no bracket at the end is returned as it is. */
export function splitTitle(title: string): { title: string; series?: string } {
  const m = /^(.*\S)\s+\(([^()]*#[^()]*)\)\s*$/.exec(title);
  return m ? { title: m[1], series: m[2] } : { title };
}

export function authorLine(b: Book): string {
  return [b.author, ...(b.coAuthors ?? [])].join(', ');
}

/** Lowercase without accents, for matching. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Books whose title, author, series, shelf name or ISBN has every word typed. */
export function searchBooks(books: Book[], query: string): Book[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return books;
  return books.filter((b) => {
    const hay = fold([b.title, authorLine(b), ...(b.shelves ?? []), b.isbn, b.isbn13].filter(Boolean).join(' '));
    return words.every((w) => hay.includes(w));
  });
}

export function onShelf(books: Book[], shelf: Shelf): Book[] {
  return books.filter((b) => b.shelf === shelf);
}

/** Read books, the most recently finished first; the ones with no date come last, newest added first. */
export function readNewestFirst(books: Book[]): Book[] {
  return onShelf(books, 'read')
    .slice()
    .sort((a, b) => (b.dateRead ?? '').localeCompare(a.dateRead ?? '') || (b.dateAdded ?? '').localeCompare(a.dateAdded ?? '') || a.title.localeCompare(b.title));
}

/** Books finished on each day (by Date Read), for the calendar. */
export function byDate(books: Book[]): Map<string, Book[]> {
  const days = new Map<string, Book[]>();
  for (const b of books) {
    if (b.shelf !== 'read' || !b.dateRead) continue;
    const list = days.get(b.dateRead) ?? [];
    list.push(b);
    days.set(b.dateRead, list);
  }
  for (const list of days.values()) list.sort((a, b) => a.title.localeCompare(b.title));
  return days;
}

export interface Summary {
  /** Read books in the period (the ones with no date only count for all time). */
  books: number;
  pages: number;
  /** Mean of your own ratings, or null when none is rated. */
  avgRating: number | null;
  rated: number;
  /** Read books with no finish date: never placed in a year. */
  undated: number;
}

/** `prefix` is "" for all time, "2026" or "2026-11". */
export function summarize(books: Book[], prefix: string): Summary {
  const read = onShelf(books, 'read');
  const inPeriod = prefix ? read.filter((b) => b.dateRead?.startsWith(prefix)) : read;
  const ratings = inPeriod.map((b) => b.rating).filter((r): r is number => r != null);
  return {
    books: inPeriod.length,
    pages: inPeriod.reduce((sum, b) => sum + (b.pages ?? 0), 0),
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    rated: ratings.length,
    undated: prefix ? 0 : read.filter((b) => !b.dateRead).length,
  };
}

/** Years with a finished book, newest first. */
export function yearsRead(books: Book[]): string[] {
  return [...new Set(onShelf(books, 'read').flatMap((b) => (b.dateRead ? [b.dateRead.slice(0, 4)] : [])))].sort().reverse();
}

/** Books and pages finished per year, from the first to the last year with one (empty years included). */
export function perYear(books: Book[]): { year: string; books: number; pages: number }[] {
  const years = yearsRead(books).reverse();
  if (!years.length) return [];
  const out: { year: string; books: number; pages: number }[] = [];
  for (let y = Number(years[0]); y <= Number(years[years.length - 1]); y++) {
    const s = summarize(books, String(y));
    out.push({ year: String(y), books: s.books, pages: s.pages });
  }
  return out;
}

/** Books per month of a year, January to December. */
export function perMonth(books: Book[], year: string): number[] {
  const counts = Array<number>(12).fill(0);
  for (const b of onShelf(books, 'read')) if (b.dateRead?.startsWith(year)) counts[Number(b.dateRead.slice(5, 7)) - 1]++;
  return counts;
}

/** Your ratings 1–5: how many books each. */
export function ratingCounts(books: Book[], prefix: string): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const b of onShelf(books, 'read')) if (b.rating && (!prefix || b.dateRead?.startsWith(prefix))) counts[b.rating - 1]++;
  return counts;
}

/** Authors by books read (co-authors count too), most first. */
export function topAuthors(books: Book[], prefix: string): { author: string; books: number; pages: number }[] {
  const by = new Map<string, { author: string; books: number; pages: number }>();
  for (const b of onShelf(books, 'read')) {
    if (prefix && !b.dateRead?.startsWith(prefix)) continue;
    for (const author of [b.author, ...(b.coAuthors ?? [])]) {
      const row = by.get(author) ?? { author, books: 0, pages: 0 };
      row.books++;
      row.pages += b.pages ?? 0;
      by.set(author, row);
    }
  }
  return [...by.values()].sort((a, b) => b.books - a.books || b.pages - a.pages || a.author.localeCompare(b.author));
}

/** The longest and the shortest read book in the period that has a page count. */
export function extremes(books: Book[], prefix: string): { longest?: Book; shortest?: Book } {
  const withPages = onShelf(books, 'read').filter((b) => b.pages && (!prefix || b.dateRead?.startsWith(prefix)));
  if (!withPages.length) return {};
  const sorted = withPages.slice().sort((a, b) => a.pages! - b.pages!);
  return { shortest: sorted[0], longest: sorted[sorted.length - 1] };
}

/** Finished books with the same title written as one (a re-read has one record, `readCount` says how often). */
export function rereads(books: Book[]): Book[] {
  return onShelf(books, 'read')
    .filter((b) => (b.readCount ?? 1) > 1)
    .sort((a, b) => (b.readCount ?? 0) - (a.readCount ?? 0) || a.title.localeCompare(b.title));
}
