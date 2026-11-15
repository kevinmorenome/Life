import { describe, expect, it } from 'vitest';
import type { BookHit } from '../../../worker/bookHit';
import { bookFromHit, edit, moveToShelf, rate, setFinished, typedBook } from './bookEdits';
import type { Book } from './types';

const NOW = '2026-11-14T10:00:00.000Z';
const DAY = '2026-11-14';
const gr: Book = { id: 'gr-1', title: 'Dune', author: 'FH', shelf: 'to-read', source: 'goodreads', createdAt: '', updatedAt: '' };
const mine: Book = { ...gr, id: 'ol-OL1W', source: 'manual' };

describe('edit', () => {
  it('notes the changed fields on a Goodreads book, so an import leaves them', () => {
    const b = edit(gr, { rating: 4 }, NOW);
    expect(b).toMatchObject({ rating: 4, edited: ['rating'], updatedAt: NOW });
    expect(edit(b, { shelf: 'read', rating: 5 }, NOW).edited).toEqual(['rating', 'shelf']);
  });
  it('does not track anything on a book you added', () => {
    expect(edit(mine, { rating: 4 }, NOW).edited).toBeUndefined();
  });
  it('removes a field set to undefined and does not change the original', () => {
    const b = edit({ ...mine, dateRead: '2026-01-01' }, { dateRead: undefined }, NOW);
    expect(Object.keys(b)).not.toContain('dateRead');
    expect(gr.rating).toBeUndefined();
  });
});

describe('moveToShelf', () => {
  it('gives a book that becomes read today as its finish date, and keeps one it has', () => {
    expect(moveToShelf(gr, 'read', DAY, NOW)).toMatchObject({ shelf: 'read', dateRead: DAY });
    expect(moveToShelf({ ...gr, dateRead: '2026-02-02' }, 'read', DAY, NOW).dateRead).toBe('2026-02-02');
  });
  it('drops the finish date when it leaves read', () => {
    const b = moveToShelf({ ...mine, shelf: 'read', dateRead: '2026-02-02' }, 'to-read', DAY, NOW);
    expect(b.shelf).toBe('to-read');
    expect(Object.keys(b)).not.toContain('dateRead');
  });
  it('is the same book when nothing changes', () => {
    expect(moveToShelf(gr, 'to-read', DAY, NOW)).toBe(gr);
  });
});

describe('rate', () => {
  it('sets a rating, and tapping the same one again clears it', () => {
    const b = rate(mine, 4, NOW);
    expect(b.rating).toBe(4);
    expect(Object.keys(rate(b, 4, NOW))).not.toContain('rating');
    expect(rate(b, 5, NOW).rating).toBe(5);
  });
  it('ignores a rating that is not 1 to 5', () => {
    expect(rate(mine, 0, NOW)).toBe(mine);
    expect(rate(mine, 6, NOW)).toBe(mine);
  });
});

describe('setFinished', () => {
  const read: Book = { ...mine, shelf: 'read', dateRead: '2026-05-05' };
  it('changes the finish date of a read book', () => {
    expect(setFinished(read, '2026-06-01', DAY, NOW).dateRead).toBe('2026-06-01');
  });
  it('refuses a future day, a bad date, no change, or a book that is not read', () => {
    expect(setFinished(read, '2027-01-01', DAY, NOW)).toBe(read);
    expect(setFinished(read, 'nope', DAY, NOW)).toBe(read);
    expect(setFinished(read, '2026-05-05', DAY, NOW)).toBe(read);
    expect(setFinished(mine, '2026-06-01', DAY, NOW)).toBe(mine);
  });
});

describe('adding', () => {
  const hit: BookHit = { key: 'OL893415W', title: 'Dune', author: 'Frank Herbert', year: 1965, pages: 412, isbn13: '9780441172719', coverId: 9 };
  it('makes a book from a search result, once per work', () => {
    expect(bookFromHit(hit, 'currently-reading', DAY, NOW)).toEqual({
      id: 'ol-OL893415W', title: 'Dune', author: 'Frank Herbert', isbn13: '9780441172719', pages: 412, originalYear: 1965,
      shelf: 'currently-reading', dateAdded: DAY, source: 'manual', createdAt: NOW, updatedAt: NOW,
    });
  });
  it('dates a book added as read today', () => {
    expect(bookFromHit(hit, 'read', DAY, NOW).dateRead).toBe(DAY);
  });
  it('makes a typed book, and nothing without a title', () => {
    expect(typedBook('abc', '  Piranesi ', '', 'to-read', DAY, NOW)).toMatchObject({ id: 'book-abc', title: 'Piranesi', author: 'Unknown author', source: 'manual' });
    expect(typedBook('abc', '   ', 'x', 'read', DAY, NOW)).toBeNull();
  });
});
