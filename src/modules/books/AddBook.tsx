import { useState } from 'react';
import type { BookHit } from '../../../worker/bookHit';
import { PlusIcon } from '../../icons';
import { getAll, newId, notify, put } from '../../lib/db';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { IconMenu, type MenuEntry } from '../clothes/IconMenu';
import { SHELF_LABELS } from './books';
import { bookFromHit, typedBook } from './bookEdits';
import { lookupCover, withCover } from './cover';
import { searchBooksOnline } from './search';
import type { Book, Shelf } from './types';

const SHELVES: Shelf[] = ['to-read', 'currently-reading', 'read'];

/** The cover arrives a moment after the book is saved; it is put on the book as it is by then, so nothing you changed meanwhile is lost. */
async function addCover(id: string, book: Book, coverId?: number) {
  try {
    const photo = await lookupCover(book, coverId);
    if (!photo) return;
    const current = (await getAll<Book>('books')).find((b) => b.id === id);
    if (current && !current.hasPhoto) {
      await put('books', withCover(current, photo, new Date().toISOString()));
      notify('books');
    }
  } catch {
    /* no cover for now: "Find covers" on My books tries again */
  }
}

/** `#/books/add`: find a book by its title or author and put it on a shelf, or type it in when the search doesn't know it. */
export function AddBook({ books, onSave }: { books: Book[]; onSave: (b: Book) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<BookHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [shelf, setShelf] = useState<Shelf>('to-read');

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setError('');
    setMessage('');
    try {
      setHits(await searchBooksOnline(query));
    } catch (err) {
      setHits(null);
      setError(err instanceof Error ? err.message : 'Could not search.');
    }
    setSearching(false);
  }

  async function add(hit: BookHit, to: Shelf) {
    const book = bookFromHit(hit, to, today(), new Date().toISOString());
    await onSave(book);
    setMessage(`Added “${book.title}” to ${SHELF_LABELS[to]}.`);
    void addCover(book.id, book, hit.coverId);
  }

  async function addTyped(e: React.FormEvent) {
    e.preventDefault();
    const book = typedBook(newId(), title, author, shelf, today(), new Date().toISOString());
    if (!book) return;
    await onSave(book);
    setMessage(`Added “${book.title}” to ${SHELF_LABELS[shelf]}.`);
    setTitle('');
    setAuthor('');
    void addCover(book.id, book);
  }

  const have = (hit: BookHit) => books.find((b) => b.id === `ol-${hit.key}`);
  const entries = (hit: BookHit): MenuEntry[] => SHELVES.map((s) => ({ label: SHELF_LABELS[s], icon: <PlusIcon />, onSelect: () => void add(hit, s) }));

  return (
    <>
      <h1>Add a book</h1>
      <form className="books-search-form" onSubmit={search}>
        <label className="books-search">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title or author" aria-label="Search for a book" autoFocus />
        </label>
        <button type="submit" className="btn btn-primary" disabled={searching || query.trim().length < 2}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
      {error && <p className="small" role="alert">{error}</p>}

      {hits && hits.length === 0 && <p className="muted">Nothing found for that. Try fewer words, or add it by hand below.</p>}
      {hits && hits.length > 0 && (
        <ul className="book-list">
          {hits.map((h) => {
            const mine = have(h);
            return (
              <li key={h.key} className="book-row book-hit">
                <span className="book-cover book-row-cover" aria-hidden>
                  {h.title.slice(0, 1).toUpperCase()}
                  {h.coverId && <img src={`/api/books/cover?id=${h.coverId}`} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                </span>
                <span className="book-text">
                  <strong className="book-row-title">{h.title}</strong>
                  <span className="muted small">{[h.author, ...(h.coAuthors ?? [])].join(', ')}</span>
                  <span className="muted small">{[h.year, h.pages ? `${h.pages} pages` : undefined].filter(Boolean).join(' · ')}</span>
                </span>
                {mine ? (
                  <a className="chip book-hit-have" href={href(`/books/${mine.id}`)}>
                    {SHELF_LABELS[mine.shelf]}
                  </a>
                ) : (
                  <IconMenu entries={entries(h)} label={`Add “${h.title}” to a shelf`} icon={<PlusIcon />} triggerClassName="icon-btn book-hit-add" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="book-by-hand">
        <summary>Can’t find it? Add it by hand</summary>
        <form onSubmit={addTyped}>
          <label className="field">
            <span className="muted small">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="field">
            <span className="muted small">Author</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <div className="chips" role="group" aria-label="Shelf">
            {SHELVES.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={shelf === s} onClick={() => setShelf(s)}>
                {SHELF_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="form-actions start">
            <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
              Add book
            </button>
          </div>
        </form>
      </details>
    </>
  );
}
