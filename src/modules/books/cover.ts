// Book covers: found on Open Library through the Worker (`worker/bookCovers.ts`) and kept as the book's photo.

import { resizeImage } from '../../lib/image';
import { splitTitle } from './books';
import type { Book } from './types';

/** Covers are small: the list shows about 40 px, the book page about 150. */
const SIZE = 480;

/** A book with no cover yet that Open Library hasn't already been asked about. */
export const needsCover = (b: Book): boolean => !b.photo && !b.hasPhoto && !b.coverMissing;

export const withCover = (b: Book, photo: string, now: string): Book => {
  const { coverMissing: _m, ...rest } = b;
  return { ...rest, photo, hasPhoto: true, updatedAt: now };
};

/** Remembers there was nothing, so the next run skips it. */
export const withoutCover = (b: Book, day: string, now: string): Book => {
  const { photo: _p, ...rest } = b;
  return { ...rest, hasPhoto: false, coverMissing: day, updatedAt: now };
};

/** The cover as a small data URL, or null when Open Library has none. Throws when it can't be asked (offline, no Worker): that is not "no cover". */
export async function lookupCover(b: Book): Promise<string | null> {
  const params = new URLSearchParams({ title: splitTitle(b.title).title, author: b.author });
  if (b.isbn13) params.set('isbn13', b.isbn13);
  if (b.isbn) params.set('isbn', b.isbn);
  const res = await fetch(`/api/books/cover?${params}`);
  if (res.status === 404) return null;
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) throw new Error('Could not look up covers.');
  return resizeImage(await res.blob(), SIZE, 0.82);
}

export interface CoverRun {
  found: number;
  missing: number;
  /** Lookups that couldn't be made; the run stops after three in a row. */
  failed: number;
}

interface Deps {
  lookup: (b: Book) => Promise<string | null>;
  save: (b: Book) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
  now: string;
  day: string;
}

/** Looks the covers up a few at a time and saves each as it arrives; gives up after three failures in a row (no network, no Worker). */
export async function fillCovers(books: Book[], deps: Deps, concurrency = 3): Promise<CoverRun> {
  const todo = books.filter(needsCover);
  const run: CoverRun = { found: 0, missing: 0, failed: 0 };
  let next = 0;
  let done = 0;
  let streak = 0;
  async function worker() {
    while (streak < 3 && next < todo.length) {
      const book = todo[next++];
      try {
        const photo = await deps.lookup(book);
        streak = 0;
        if (photo) run.found++;
        else run.missing++;
        await deps.save(photo ? withCover(book, photo, deps.now) : withoutCover(book, deps.day, deps.now));
      } catch {
        run.failed++;
        streak++;
      }
      deps.onProgress?.(++done, todo.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return run;
}
