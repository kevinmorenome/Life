import { describe, expect, it } from 'vitest';
import { byDate, extremes, inShelf, perMonth, perYear, ratingCounts, readNewestFirst, rereads, searchBooks, shelfFilters, sortBooks, splitTitle, summarize, topAuthors, yearsRead } from './books';
import type { Book } from './types';

let n = 0;
const book = (title: string, extra: Partial<Book> = {}): Book => ({ id: `gr-${++n}`, title, author: 'A', shelf: 'read', source: 'goodreads', createdAt: '', updatedAt: '', ...extra });

const list = [
  book('Dune (Dune, #1)', { author: 'Frank Herbert', dateRead: '2025-03-02', pages: 400, rating: 5, readCount: 2 }),
  book('Good Omens', { author: 'Terry Pratchett', coAuthors: ['Neil Gaiman'], dateRead: '2025-11-09', pages: 300, rating: 4 }),
  book('Piranesi', { author: 'Susanna Clarke', pages: 270, rating: 3 }),
  book('Neuromancer', { author: 'William Gibson', dateRead: '2026-01-15', pages: 250 }),
  book('The Hobbit', { author: 'J.R.R. Tolkien', shelf: 'to-read', pages: 300 }),
  book('Élan', { author: 'Frank Herbert', dateRead: '2026-02-01', shelf: 'read' }),
];

describe('splitTitle', () => {
  it('separates the series', () => {
    expect(splitTitle('Dune (Dune, #1)')).toEqual({ title: 'Dune', series: 'Dune, #1' });
    expect(splitTitle('Good Omens')).toEqual({ title: 'Good Omens' });
    expect(splitTitle('Something (Not a series)')).toEqual({ title: 'Something (Not a series)' });
  });
});

describe('searchBooks', () => {
  it('matches words of the title, authors and shelves, ignoring accents', () => {
    expect(searchBooks(list, 'gaiman').map((b) => b.title)).toEqual(['Good Omens']);
    expect(searchBooks(list, 'elan').map((b) => b.title)).toEqual(['Élan']);
    expect(searchBooks(list, 'frank dune').map((b) => b.title)).toEqual(['Dune (Dune, #1)']);
    expect(searchBooks(list, '  ')).toBe(list);
  });
});

describe('readNewestFirst / byDate', () => {
  it('sorts by finish date and puts undated last', () => {
    expect(readNewestFirst(list).map((b) => b.title)).toEqual(['Élan', 'Neuromancer', 'Good Omens', 'Dune (Dune, #1)', 'Piranesi']);
  });
  it('groups the books finished each day and skips undated or unread ones', () => {
    const days = byDate([...list, book('Same day', { dateRead: '2025-03-02' })]);
    expect([...days.keys()].sort()).toEqual(['2025-03-02', '2025-11-09', '2026-01-15', '2026-02-01']);
    expect(days.get('2025-03-02')!.map((b) => b.title)).toEqual(['Dune (Dune, #1)', 'Same day']);
  });
});

describe('summarize', () => {
  it('counts a year, its pages and its average rating', () => {
    expect(summarize(list, '2025')).toEqual({ books: 2, pages: 700, avgRating: 4.5, rated: 2, undated: 0 });
  });
  it('counts all time, with the undated ones', () => {
    expect(summarize(list, '')).toMatchObject({ books: 5, pages: 1220, rated: 3, undated: 1 });
    expect(summarize(list, '2030')).toMatchObject({ books: 0, avgRating: null });
  });
});

describe('per year / month', () => {
  it('lists years newest first and fills empty years', () => {
    expect(yearsRead(list)).toEqual(['2026', '2025']);
    expect(perYear(list)).toEqual([
      { year: '2025', books: 2, pages: 700 },
      { year: '2026', books: 2, pages: 250 },
    ]);
    expect(perYear([book('x', { dateRead: '2023-01-01' }), book('y', { dateRead: '2025-01-01' })]).map((y) => y.year)).toEqual(['2023', '2024', '2025']);
    expect(perYear([])).toEqual([]);
  });
  it('counts a year by month', () => {
    const m = perMonth(list, '2025');
    expect(m[2]).toBe(1);
    expect(m[10]).toBe(1);
    expect(m.reduce((a, b) => a + b)).toBe(2);
  });
});

describe('ratings, authors, extremes, rereads', () => {
  it('counts your ratings', () => {
    expect(ratingCounts(list, '')).toEqual([0, 0, 1, 1, 1]);
    expect(ratingCounts(list, '2025')).toEqual([0, 0, 0, 1, 1]);
  });
  it('ranks authors, co-authors included', () => {
    const t = topAuthors(list, '');
    expect(t[0]).toEqual({ author: 'Frank Herbert', books: 2, pages: 400 });
    expect(t.map((r) => r.author)).toContain('Neil Gaiman');
  });
  it('finds the longest and shortest', () => {
    const e = extremes(list, '');
    expect([e.longest?.title, e.shortest?.title]).toEqual(['Dune (Dune, #1)', 'Neuromancer']);
    expect(extremes([], '')).toEqual({});
  });
  it('lists books read more than once', () => {
    expect(rereads(list).map((b) => b.title)).toEqual(['Dune (Dune, #1)']);
  });
});

describe('sortBooks', () => {
  const b = [
    book('Beta', { author: 'Zed', dateRead: '2025-01-01', dateAdded: '2024-01-01', rating: 3 }),
    book('Alpha (S, #1)', { author: 'Amy', dateRead: '2026-01-01', dateAdded: '2023-01-01', rating: 5 }),
    book('Gamma', { author: 'Bob', shelf: 'to-read', dateAdded: '2026-06-01' }),
  ];
  const titles = (key: Parameters<typeof sortBooks>[1]) => sortBooks(b, key).map((x) => splitTitle(x.title).title);
  it('sorts by the key and does not change the list', () => {
    expect(titles('recent')).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(titles('added')).toEqual(['Gamma', 'Beta', 'Alpha']);
    expect(titles('rating')).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(titles('title')).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(titles('author')).toEqual(['Alpha', 'Gamma', 'Beta']);
    expect(b[0].title).toBe('Beta');
  });
});

describe('shelfFilters / inShelf', () => {
  const b = [book('A', { shelves: ['fantasy', 'favorites'] }), book('B', { shelf: 'to-read', shelves: ['fantasy'] }), book('C', { shelf: 'currently-reading' })];
  it('lists All, the shelves that have books and your own shelves by size', () => {
    expect(shelfFilters(b).map((f) => [f.id, f.count])).toEqual([['all', 3], ['read', 1], ['currently-reading', 1], ['to-read', 1], ['tag:fantasy', 2], ['tag:favorites', 1]]);
    expect(shelfFilters(b, 1).filter((f) => f.id.startsWith('tag:'))).toHaveLength(1);
  });
  it('filters by a shelf or one of your own', () => {
    expect(inShelf(b, 'all')).toHaveLength(3);
    expect(inShelf(b, 'to-read').map((x) => x.title)).toEqual(['B']);
    expect(inShelf(b, 'tag:fantasy').map((x) => x.title)).toEqual(['A', 'B']);
  });
});
