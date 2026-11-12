// Pure mapping from a Goodreads library export (CSV: Goodreads → My Books → Import and export → Export Library) to Books.
// Type-only imports so Node can run it. Columns are read by their header name, so a different order is fine.
// Private notes in the export are never read.

import type { Book, Shelf } from '../types';

export interface ParsedGoodreads {
  books: Book[];
  /** Rows with no id or no title. */
  skipped: number;
}

/** Splits CSV text into rows of fields: quoted fields may hold commas, doubled quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** `="0156012197"` (Goodreads protects ISBNs from spreadsheets this way) → `0156012197`; empty when there is none. */
export function cleanIsbn(raw: string | undefined): string | undefined {
  const digits = (raw ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
  return digits.length === 10 || digits.length === 13 ? digits : undefined;
}

/** `2023/05/14` → `2023-05-14`; anything that isn't a date → undefined (a date is never invented). */
export function isoDate(raw: string | undefined): string | undefined {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec((raw ?? '').trim());
  if (!m) return undefined;
  const [mo, d] = [Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const num = (raw: string | undefined): number | undefined => {
  const n = Number((raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const SHELVES: Record<string, Shelf> = { read: 'read', 'currently-reading': 'currently-reading', 'to-read': 'to-read' };

/**
 * Reads the export. Throws when it doesn't look like one (no "Book Id" and "Title" columns).
 * Unrated books (My Rating 0) get no rating, and a read book with no Date Read keeps none.
 */
export function parseGoodreads(text: string, now: string): ParsedGoodreads {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  if (col('Book Id') < 0 || col('Title') < 0) throw new Error('That doesn’t look like a Goodreads export (no “Book Id” and “Title” columns).');

  const books: Book[] = [];
  let skipped = 0;
  for (const f of rows.slice(1)) {
    const get = (name: string) => {
      const i = col(name);
      return i < 0 ? undefined : (f[i] ?? '').trim() || undefined;
    };
    const bookId = get('Book Id');
    const title = get('Title');
    if (!bookId || !title) {
      skipped++;
      continue;
    }
    const exclusive = get('Exclusive Shelf')?.toLowerCase() ?? '';
    const shelf = SHELVES[exclusive] ?? 'other';
    const shelves = (get('Bookshelves') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== exclusive);
    if (shelf === 'other' && exclusive) shelves.unshift(exclusive);
    const coAuthors = (get('Additional Authors') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const readCount = num(get('Read Count'));
    const book: Book = {
      id: `gr-${bookId}`,
      title,
      author: get('Author') ?? 'Unknown author',
      coAuthors: coAuthors.length ? coAuthors : undefined,
      isbn: cleanIsbn(get('ISBN')),
      isbn13: cleanIsbn(get('ISBN13')),
      rating: num(get('My Rating')),
      avgRating: num(get('Average Rating')),
      publisher: get('Publisher'),
      binding: get('Binding'),
      pages: num(get('Number of Pages')),
      year: num(get('Year Published')),
      originalYear: num(get('Original Publication Year')),
      dateRead: isoDate(get('Date Read')),
      dateAdded: isoDate(get('Date Added')),
      shelf,
      shelves: shelves.length ? shelves : undefined,
      review: get('My Review'),
      readCount: readCount && readCount > 1 ? readCount : undefined,
      source: 'goodreads',
      createdAt: now,
      updatedAt: now,
    };
    // Leave out what Goodreads left empty, so records stay small and compare cleanly.
    for (const k of Object.keys(book) as (keyof Book)[]) if (book[k] === undefined) delete book[k];
    books.push(book);
  }
  return { books, skipped };
}

export interface ImportPlan {
  write: Book[];
  added: number;
  updated: number;
  unchanged: number;
}

/** Fields the app adds itself (the cover): an import never compares, replaces or drops them. */
const LOCAL = ['photo', 'hasPhoto', 'coverMissing'] as const;

/** A book's Goodreads data only (no cover, no timestamps), with sorted keys, for comparing. */
const content = (b: Book): string => {
  const { createdAt: _c, updatedAt: _u, ...rest } = b;
  for (const k of LOCAL) delete rest[k];
  return JSON.stringify(Object.fromEntries(Object.entries(rest).sort(([x], [y]) => x.localeCompare(y))));
};
const sameContent = (a: Book, b: Book) => content(a) === content(b);

/**
 * Which books to write: new ones, and ones whose Goodreads data changed (the older `createdAt` is kept).
 * A book that is the same as the stored one is left alone (its cover never counts), so re-importing doesn't touch (or sync) anything.
 */
export function planImport(parsed: Book[], existing: Book[]): ImportPlan {
  const stored = new Map(existing.map((b) => [b.id, b]));
  const plan: ImportPlan = { write: [], added: 0, updated: 0, unchanged: 0 };
  for (const book of parsed) {
    const old = stored.get(book.id);
    if (!old) {
      plan.write.push(book);
      plan.added++;
    } else if (sameContent(old, book)) plan.unchanged++;
    else {
      const kept = Object.fromEntries(LOCAL.filter((k) => old[k] !== undefined).map((k) => [k, old[k]]));
      plan.write.push({ ...book, ...kept, createdAt: old.createdAt });
      plan.updated++;
    }
  }
  return plan;
}
