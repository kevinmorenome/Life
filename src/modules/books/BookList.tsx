import { useMemo, useState } from 'react';
import { CheckIcon, ListIcon, SearchIcon } from '../../icons';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { IconMenu, type MenuEntry } from '../clothes/IconMenu';
import { ChevronRightIcon, SlidersIcon } from '../clothes/icons';
import { authorLine, inShelf, onShelf, searchBooks, shelfFilters, SORTS, sortBooks, splitTitle, summarize, type SortKey } from './books';
import { BookCover } from './BookCover';
import { needsCover } from './cover';
import { Stars } from './Stars';
import type { Book } from './types';
import { useFindCovers } from './useFindCovers';

type View = 'grid' | 'list';
const VIEW_KEY = 'books-view';
const SORT_KEY = 'books-sort';

/** A per-viewer convenience: remembered in this browser, never synced. */
function remembered<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* it just won't be remembered */
  }
}

const count = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/** One line under a book's author: where it stands. */
function status(b: Book): string {
  if (b.shelf === 'read') return b.dateRead ? `Finished ${shortDate(b.dateRead)}` : 'Read';
  if (b.shelf === 'currently-reading') return 'Currently reading';
  if (b.shelf === 'to-read') return b.dateAdded ? `Want to read · added ${shortDate(b.dateAdded)}` : 'Want to read';
  return b.shelves?.[0] ?? '';
}

/**
 * My Books, after Goodreads: this year's tally, what you're reading as a shelf of covers, chips for your shelves with their
 * counts, then every book as a grid of covers or a list with ratings, with search and sorting.
 */
export function BookList({ books }: { books: Book[] }) {
  const [shelf, setShelf] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>(() => remembered('books-view', ['grid', 'list'], 'list'));
  const [sort, setSort] = useState<SortKey>(() => remembered(SORT_KEY, SORTS.map((s) => s.id), 'recent'));
  const [limit, setLimit] = useState(60);
  const [coverMessage, setCoverMessage] = useState('');
  const covers = useFindCovers();

  const filters = useMemo(() => shelfFilters(books), [books]);
  const year = today().slice(0, 4);
  const thisYear = useMemo(() => summarize(books, year), [books, year]);
  const reading = useMemo(() => sortBooks(onShelf(books, 'currently-reading'), 'added'), [books]);
  const shown = useMemo(() => sortBooks(searchBooks(inShelf(books, shelf), query), sort), [books, shelf, query, sort]);
  const withoutCovers = useMemo(() => books.filter(needsCover).length, [books]);
  const current = filters.find((f) => f.id === shelf) ?? filters[0];

  const pick = <T extends string>(key: string, set: (v: T) => void) => (v: T) => {
    set(v);
    remember(key, v);
  };
  const sortEntries: MenuEntry[] = SORTS.map((s) => ({ label: s.label, icon: s.id === sort ? <CheckIcon /> : <span className="menu-blank" />, onSelect: () => pick<SortKey>(SORT_KEY, setSort)(s.id) }));

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
      <h1 className="books-title">My books</h1>
      {thisYear.books > 0 && (
        <a className="books-year" href={href('/stats/entertainment/books')}>
          <span>
            <strong>{year}</strong> · {count(thisYear.books, 'book')}
            {thisYear.pages > 0 && ` · ${count(thisYear.pages, 'page')}`}
          </span>
          <ChevronRightIcon />
        </a>
      )}

      {reading.length > 0 && !query && (
        <section className="books-reading" aria-label="Currently reading">
          <h2>Currently reading</h2>
          <ul className="books-shelf-row">
            {reading.map((b) => (
              <li key={b.id}>
                <a href={href(`/books/${b.id}`)} aria-label={b.title}>
                  <BookCover book={b} label className="book-shelf-cover" />
                  <span className="book-shelf-title">{splitTitle(b.title).title}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="books-chips" role="group" aria-label="Shelves">
        {filters.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={f.id === current.id} onClick={() => { setShelf(f.id); setLimit(60); }}>
            {f.label} <span className="chip-count">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="books-bar">
        <label className="books-search">
          <SearchIcon />
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(60); }} placeholder="Search books" aria-label="Search books" />
        </label>
        <IconMenu entries={sortEntries} label={`Sort: ${SORTS.find((s) => s.id === sort)?.label}`} icon={<SlidersIcon />} triggerClassName="icon-btn" />
        <button type="button" className="icon-btn" aria-label={view === 'grid' ? 'Show as a list' : 'Show as covers'} onClick={() => pick<View>(VIEW_KEY, setView)(view === 'grid' ? 'list' : 'grid')}>
          {view === 'grid' ? <ListIcon /> : <GridIcon />}
        </button>
      </div>

      {withoutCovers > 0 && (
        <div className="books-covers-banner">
          <span className="small">{covers.progress || coverMessage || `${count(withoutCovers, 'book')} without a cover.`}</span>
          <button type="button" className="btn" disabled={covers.busy} onClick={() => { setCoverMessage(''); void covers.find().then(setCoverMessage); }}>
            Find covers
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="muted">{query ? 'No book matches that.' : 'Nothing on this shelf.'}</p>
      ) : view === 'grid' ? (
        <ul className="book-grid">
          {shown.slice(0, limit).map((b) => (
            <li key={b.id}>
              <a className="book-tile" href={href(`/books/${b.id}`)} aria-label={`${b.title}, ${authorLine(b)}`}>
                <BookCover book={b} label className="book-tile-cover" />
                <Stars rating={b.rating} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="book-list">
          {shown.slice(0, limit).map((b) => {
            const { title, series } = splitTitle(b.title);
            return (
              <li key={b.id}>
                <a className="book-row" href={href(`/books/${b.id}`)}>
                  <BookCover book={b} className="book-row-cover" />
                  <span className="book-text">
                    <strong className="book-row-title">{title}</strong>
                    <span className="muted small">{[authorLine(b), series].filter(Boolean).join(' · ')}</span>
                    {b.avgRating != null && <span className="muted small">★ {b.avgRating.toFixed(2)} avg rating</span>}
                    {b.rating ? (
                      <span className="small">
                        <span className="muted">My rating </span>
                        <Stars rating={b.rating} />
                      </span>
                    ) : null}
                    <span className="muted small">{status(b)}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > limit && (
        <button type="button" className="btn books-more" onClick={() => setLimit((n) => n + 60)}>
          Show more ({shown.length - limit})
        </button>
      )}
    </>
  );
}

/** Four squares: the cover grid view. */
const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </svg>
);
