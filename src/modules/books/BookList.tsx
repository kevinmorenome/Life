import { useMemo, useState } from 'react';
import { SearchIcon } from '../../icons';
import { shortDate } from '../../lib/format';
import { href } from '../../lib/router';
import { authorLine, onShelf, readNewestFirst, searchBooks, SHELF_LABELS, splitTitle } from './books';
import { Stars } from './Stars';
import type { Book, Shelf } from './types';

const TABS: Shelf[] = ['currently-reading', 'to-read', 'read'];
const TAB_WITH_OTHER: Shelf[] = [...TABS, 'other'];

/** The shelves: Reading | To read | Read, with a search over titles, authors and your own shelves. */
export function BookList({ books }: { books: Book[] }) {
  const [shelf, setShelf] = useState<Shelf>(() => (onShelf(books, 'currently-reading').length ? 'currently-reading' : 'read'));
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);

  const shown = useMemo(() => {
    const list = shelf === 'read' ? readNewestFirst(books) : onShelf(books, shelf).sort((a, b) => (b.dateAdded ?? '').localeCompare(a.dateAdded ?? '') || a.title.localeCompare(b.title));
    return searchBooks(list, query);
  }, [books, shelf, query]);
  const tabs = onShelf(books, 'other').length ? TAB_WITH_OTHER : TABS;

  if (books.length === 0) {
    return (
      <div className="empty">
        <h1>Books</h1>
        <p className="muted">Nothing here yet. On Goodreads, open My Books → Import and export → Export Library, then choose that file in Settings → Import from Goodreads.</p>
        <a className="btn btn-primary" href={href('/settings')}>
          Open Settings
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="seg seg-scroll" role="tablist" aria-label="Shelves">
        {tabs.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={shelf === s} onClick={() => { setShelf(s); setLimit(40); }}>
            {SHELF_LABELS[s]} <span className="muted">{onShelf(books, s).length}</span>
          </button>
        ))}
      </div>
      <label className="books-search">
        <SearchIcon />
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(40); }} placeholder="Search title or author…" aria-label="Search books" />
      </label>
      {shown.length === 0 ? (
        <p className="muted">{query ? 'No book matches that.' : 'Nothing on this shelf.'}</p>
      ) : (
        <ul className="book-list">
          {shown.slice(0, limit).map((b) => {
            const { title, series } = splitTitle(b.title);
            return (
              <li key={b.id}>
                <a className="book-row" href={href(`/books/${b.id}`)}>
                  <span className="book-spine" aria-hidden>
                    {title.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="book-text">
                    <strong>{title}</strong>
                    <span className="muted small">{[authorLine(b), series].filter(Boolean).join(' · ')}</span>
                    <span className="small">
                      <Stars rating={b.rating} />
                      {b.dateRead && <span className="muted">{b.rating ? ' · ' : ''}{shortDate(b.dateRead)}</span>}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > limit && (
        <button type="button" className="btn books-more" onClick={() => setLimit((n) => n + 40)}>
          Show more ({shown.length - limit})
        </button>
      )}
    </>
  );
}
