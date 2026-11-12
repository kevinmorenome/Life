import { describe, expect, it } from 'vitest';
import { fillCovers, needsCover, withCover, withoutCover } from './cover';
import type { Book } from './types';

let n = 0;
const book = (extra: Partial<Book> = {}): Book => ({ id: `gr-${++n}`, title: `B${n}`, author: 'A', shelf: 'read', source: 'goodreads', createdAt: '', updatedAt: '', ...extra });
const deps = (lookup: (b: Book) => Promise<string | null>, saved: Book[] = []) => ({ lookup, save: async (b: Book) => void saved.push(b), now: 'NOW', day: '2026-11-11' });

describe('needsCover', () => {
  it('is for books with no cover that were not tried', () => {
    expect(needsCover(book())).toBe(true);
    expect(needsCover(book({ hasPhoto: true }))).toBe(false);
    expect(needsCover(book({ photo: 'data:x' }))).toBe(false);
    expect(needsCover(book({ coverMissing: '2026-01-01' }))).toBe(false);
  });
});

describe('withCover / withoutCover', () => {
  it('sets the photo and forgets an earlier miss', () => {
    expect(withCover(book({ coverMissing: '2026-01-01' }), 'data:img', 'NOW')).toMatchObject({ photo: 'data:img', hasPhoto: true, updatedAt: 'NOW' });
    expect(withCover(book({ coverMissing: '2026-01-01' }), 'data:img', 'NOW').coverMissing).toBeUndefined();
  });
  it('remembers a miss and drops a photo', () => {
    const b = withoutCover(book({ photo: 'data:old' }), '2026-11-11', 'NOW');
    expect(b).toMatchObject({ hasPhoto: false, coverMissing: '2026-11-11' });
    expect(b.photo).toBeUndefined();
  });
});

describe('fillCovers', () => {
  it('saves a cover for each book that has one and remembers the others', async () => {
    const saved: Book[] = [];
    const books = [book(), book(), book({ hasPhoto: true }), book()];
    const run = await fillCovers(books, deps(async (b) => (b.id === books[1].id ? null : 'data:img'), saved));
    expect(run).toEqual({ found: 2, missing: 1, failed: 0 });
    expect(saved).toHaveLength(3);
    expect(saved.find((b) => b.id === books[1].id)?.coverMissing).toBe('2026-11-11');
  });
  it('reports progress', async () => {
    const seen: string[] = [];
    await fillCovers([book(), book()], { ...deps(async () => 'x'), onProgress: (d, t) => void seen.push(`${d}/${t}`) }, 1);
    expect(seen).toEqual(['1/2', '2/2']);
  });
  it('stops after three failures in a row and saves nothing for them', async () => {
    const saved: Book[] = [];
    let asked = 0;
    const run = await fillCovers(Array.from({ length: 10 }, () => book()), deps(async () => { asked++; throw new Error('offline'); }, saved), 1);
    expect(run).toMatchObject({ found: 0, missing: 0, failed: 3 });
    expect(asked).toBe(3);
    expect(saved).toEqual([]);
  });
});
