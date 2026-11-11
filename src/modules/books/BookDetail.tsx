import { shortDate } from '../../lib/format';
import { authorLine, SHELF_LABELS, splitTitle } from './books';
import { Stars } from './Stars';
import type { Book } from './types';

/** One book, read only: what Goodreads says about it and what you said (rating, review, dates, shelves). */
export function BookDetail({ book: b }: { book: Book }) {
  const { title, series } = splitTitle(b.title);
  const facts: [string, string | undefined][] = [
    ['Shelf', SHELF_LABELS[b.shelf]],
    ['Finished', b.dateRead ? shortDate(b.dateRead) : b.shelf === 'read' ? 'Date not in Goodreads' : undefined],
    ['Added', b.dateAdded ? shortDate(b.dateAdded) : undefined],
    ['Times read', b.readCount ? String(b.readCount) : undefined],
    ['Pages', b.pages ? String(b.pages) : undefined],
    ['Format', b.binding],
    ['Publisher', b.publisher],
    ['Published', b.year ? String(b.year) : undefined],
    ['First published', b.originalYear && b.originalYear !== b.year ? String(b.originalYear) : undefined],
    ['Goodreads average', b.avgRating ? b.avgRating.toFixed(2) : undefined],
    ['ISBN', b.isbn13 ?? b.isbn],
  ];
  return (
    <>
      <h1>{title}</h1>
      <p className="muted">{[authorLine(b), series].filter(Boolean).join(' · ')}</p>
      {b.rating && (
        <p>
          <Stars rating={b.rating} />
        </p>
      )}
      {b.shelves && (
        <div className="chips" aria-label="Your shelves">
          {b.shelves.map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </div>
      )}
      {b.review && (
        <section className="card">
          <h2>Your review</h2>
          <p className="book-review">{b.review}</p>
        </section>
      )}
      <section className="card">
        <h2>Details</h2>
        <dl className="book-facts">
          {facts.map(([k, v]) =>
            v ? (
              <div key={k}>
                <dt className="muted small">{k}</dt>
                <dd>{v}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </section>
      <p className="muted small">From your Goodreads export. Import a newer export in Settings to update it.</p>
    </>
  );
}
