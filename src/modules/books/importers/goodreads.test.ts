import { describe, expect, it } from 'vitest';
import { SAMPLE_EXPORT } from '../goodreads.fixture';
import type { Book } from '../types';
import { cleanIsbn, isoDate, parseCsv, parseGoodreads, planImport } from './goodreads';

const NOW = '2026-11-11T10:00:00.000Z';

describe('parseCsv', () => {
  it('handles quoted commas, doubled quotes and line breaks inside a field', () => {
    expect(parseCsv('a,"b, c","say ""hi""","line\nbreak"\r\nx,y,z,w\n')).toEqual([
      ['a', 'b, c', 'say "hi"', 'line\nbreak'],
      ['x', 'y', 'z', 'w'],
    ]);
  });
  it('ignores a byte-order mark and blank lines', () => {
    expect(parseCsv('﻿a,b\n\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('cleanIsbn / isoDate', () => {
  it('unwraps the spreadsheet-protected ISBN', () => {
    expect(cleanIsbn('="0441172717"')).toBe('0441172717');
    expect(cleanIsbn('="080442957x"')).toBe('080442957X');
    expect(cleanIsbn('=""')).toBeUndefined();
    expect(cleanIsbn(undefined)).toBeUndefined();
  });
  it('turns Goodreads dates into ISO and never invents one', () => {
    expect(isoDate('2025/3/2')).toBe('2025-03-02');
    expect(isoDate('2025-03-02')).toBe('2025-03-02');
    expect(isoDate('')).toBeUndefined();
    expect(isoDate('2025/13/01')).toBeUndefined();
  });
});

describe('parseGoodreads', () => {
  const { books, skipped } = parseGoodreads(SAMPLE_EXPORT, NOW);
  const byId = (id: string) => books.find((b) => b.id === id)!;

  it('reads every row with an id and a title, and counts the rest', () => {
    expect(books.map((b) => b.id)).toEqual(['gr-101', 'gr-102', 'gr-103', 'gr-104', 'gr-105']);
    expect(skipped).toBe(1);
  });
  it('maps a finished, rated book', () => {
    expect(byId('gr-101')).toMatchObject({
      title: 'Dune (Dune, #1)',
      author: 'Frank Herbert',
      isbn: '0441172717',
      isbn13: '9780441172719',
      rating: 5,
      avgRating: 4.28,
      pages: 412,
      year: 1990,
      originalYear: 1965,
      dateRead: '2025-03-02',
      dateAdded: '2024-12-30',
      shelf: 'read',
      shelves: ['sci-fi', 'favorites'],
      readCount: 2,
      source: 'goodreads',
    });
    expect(byId('gr-101').review).toBe('A "classic" for a reason.\nSecond line of the review.');
  });
  it('never reads private notes', () => {
    expect(JSON.stringify(books)).not.toContain('keep this private');
  });
  it('keeps co-authors and drops empty ISBNs', () => {
    expect(byId('gr-102').coAuthors).toEqual(['Neil Gaiman']);
    expect(byId('gr-102').isbn).toBeUndefined();
  });
  it('treats rating 0 as not rated and a missing Date Read as none', () => {
    expect(byId('gr-103').rating).toBeUndefined();
    expect(byId('gr-103').shelf).toBe('to-read');
    expect(byId('gr-104')).toMatchObject({ shelf: 'read', rating: 3 });
    expect(byId('gr-104').dateRead).toBeUndefined();
  });
  it('keeps a custom exclusive shelf as other, with its name', () => {
    expect(byId('gr-105')).toMatchObject({ shelf: 'other', shelves: ['dnf'] });
  });
  it('leaves empty fields out of the record', () => {
    expect(Object.keys(byId('gr-103'))).not.toContain('publisher');
    expect(Object.keys(byId('gr-103'))).not.toContain('readCount');
  });
  it('refuses a file that is not an export', () => {
    expect(() => parseGoodreads('Name,Amount\nx,1', NOW)).toThrow(/Goodreads/);
  });
  it('reads columns by name, in any order', () => {
    const r = parseGoodreads('Title,Exclusive Shelf,Book Id,Author\nHello,read,7,Me', NOW);
    expect(r.books[0]).toMatchObject({ id: 'gr-7', title: 'Hello', author: 'Me', shelf: 'read' });
  });
});

describe('planImport', () => {
  const parsed = parseGoodreads(SAMPLE_EXPORT, NOW).books;
  it('writes everything on a first import', () => {
    const plan = planImport(parsed, []);
    expect(plan).toMatchObject({ added: 5, updated: 0, unchanged: 0 });
    expect(plan.write).toHaveLength(5);
  });
  it('writes nothing when the same file is imported again', () => {
    const stored = parsed.map((b) => ({ ...b, createdAt: 'old', updatedAt: 'old' }));
    const again = parseGoodreads(SAMPLE_EXPORT, '2027-01-01T00:00:00.000Z').books;
    expect(planImport(again, stored)).toMatchObject({ write: [], unchanged: 5 });
  });
  it('ignores the cover when comparing, and keeps it when a book changes', () => {
    const stored: Book[] = parsed.map((b) => ({ ...b, hasPhoto: true, coverMissing: undefined, createdAt: 'old' }));
    expect(planImport(parsed, stored)).toMatchObject({ write: [], unchanged: 5 });
    stored[0] = { ...stored[0], rating: 1 };
    const plan = planImport(parsed, stored);
    expect(plan.write).toHaveLength(1);
    expect(plan.write[0]).toMatchObject({ id: 'gr-101', rating: 5, hasPhoto: true, createdAt: 'old' });
    const missing: Book[] = parsed.map((b) => ({ ...b, coverMissing: '2026-11-11', title: b.title + ' (old)' }));
    expect(planImport(parsed, missing).write[0].coverMissing).toBe('2026-11-11');
  });
  it('updates a changed book and keeps when it was first added', () => {
    const stored: Book[] = parsed.map((b) => ({ ...b, createdAt: 'old' }));
    stored[2] = { ...stored[2], shelf: 'currently-reading' };
    const plan = planImport(parsed, stored);
    expect(plan).toMatchObject({ added: 0, updated: 1, unchanged: 4 });
    expect(plan.write[0]).toMatchObject({ id: 'gr-103', shelf: 'to-read', createdAt: 'old' });
  });
});
