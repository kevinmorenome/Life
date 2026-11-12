import { useState } from 'react';
import { CameraIcon, ImageIcon, SearchIcon, TrashIcon } from '../../icons';
import { shortDate, today } from '../../lib/format';
import { IconMenu, type MenuEntry } from '../clothes/IconMenu';
import { usePhotoPicker } from '../recipes/usePhotoPicker';
import { BookCover } from './BookCover';
import { lookupCover, withCover, withoutCover } from './cover';
import { authorLine, SHELF_LABELS, splitTitle } from './books';
import { Stars } from './Stars';
import type { Book } from './types';

/** One book, read only: what Goodreads says about it and what you said (rating, review, dates, shelves). */
export function BookDetail({ book: b, onSave }: { book: Book; onSave: (b: Book) => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const picker = usePhotoPicker((photo) => onSave(withCover(b, photo, new Date().toISOString())));
  const hasCover = !!(b.photo || b.hasPhoto);

  async function lookUp() {
    setBusy(true);
    setMessage('');
    try {
      const photo = await lookupCover(b);
      const now = new Date().toISOString();
      await onSave(photo ? withCover(b, photo, now) : withoutCover(b, today(), now));
      if (!photo) setMessage('Open Library has no cover for this book. You can add your own photo.');
    } catch {
      setMessage('Could not look up the cover right now.');
    }
    setBusy(false);
  }

  const entries: MenuEntry[] = [
    { label: 'Find the cover online', icon: <SearchIcon />, onSelect: () => void lookUp() },
    { label: 'Take a photo', icon: <CameraIcon />, onSelect: picker.takePhoto },
    { label: 'Choose a photo', icon: <ImageIcon />, onSelect: picker.choosePhoto },
    ...(hasCover ? [{ label: 'Remove the cover', icon: <TrashIcon />, onSelect: () => void onSave(withoutCover(b, today(), new Date().toISOString())) }] : []),
  ];
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
      {picker.inputs}
      <div className="book-hero">
        <BookCover book={b} className="book-hero-cover" />
        <IconMenu entries={entries} label={hasCover ? 'Change the cover' : 'Add a cover'} icon={<CameraIcon />} triggerClassName="icon-btn book-hero-btn" />
      </div>
      {(busy || picker.busy) && <p className="muted small">Saving the cover…</p>}
      {(message || picker.error) && <p className="small">{message || picker.error}</p>}
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
