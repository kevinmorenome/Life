import { useState } from 'react';
import { CameraIcon, CheckIcon, ImageIcon, SearchIcon, TrashIcon } from '../../icons';
import { ChevronDownIcon } from '../clothes/icons';
import { shortDate, today } from '../../lib/format';
import { IconMenu, type MenuEntry } from '../clothes/IconMenu';
import { usePhotoPicker } from '../recipes/usePhotoPicker';
import { authorLine, SHELF_LABELS, splitTitle } from './books';
import { moveToShelf, rate, setFinished } from './bookEdits';
import { RatingInput } from './RatingInput';
import { BookCover } from './BookCover';
import { lookupCover, withCover, withoutCover } from './cover';
import type { Book } from './types';

/**
 * One book, read only, after Goodreads' book page: the cover, title and author, the average rating, where it stands on your
 * shelves, your own rating, pages / published / format, your review and the rest of what Goodreads says. The shelf, your rating
 * and the day you finished are changed right here.
 */
export function BookDetail({ book: b, onSave, onRemove }: { book: Book; onSave: (b: Book) => Promise<void>; onRemove: () => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const picker = usePhotoPicker((photo) => onSave(withCover(b, photo, new Date().toISOString())));
  const hasCover = !!(b.photo || b.hasPhoto);
  const { title, series } = splitTitle(b.title);

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
    // A Goodreads book would come back with the next import; only one you added yourself can be removed.
    ...(b.source === 'manual'
      ? [{ label: 'Remove from my books', icon: <TrashIcon />, danger: true, onSelect: () => confirm(`Remove “${title}” from your books?`) && void onRemove() }]
      : []),
  ];
  const shelfEntries: MenuEntry[] = (['to-read', 'currently-reading', 'read'] as const).map((s) => ({
    label: SHELF_LABELS[s],
    icon: b.shelf === s ? <CheckIcon /> : <span className="menu-blank" />,
    onSelect: () => void onSave(moveToShelf(b, s, today(), new Date().toISOString())),
  }));

  const figures: [string, string | undefined][] = [
    ['Pages', b.pages ? b.pages.toLocaleString() : undefined],
    ['Published', b.originalYear ? String(b.originalYear) : b.year ? String(b.year) : undefined],
    ['Format', b.binding],
  ];
  const stateLine =
    b.shelf === 'read' ? (b.dateRead ? `Read · ${shortDate(b.dateRead)}` : 'Read') : b.shelf === 'other' ? (b.shelves?.[0] ?? 'On a shelf of yours') : SHELF_LABELS[b.shelf];
  const facts: [string, string | undefined][] = [
    ['Added', b.dateAdded ? shortDate(b.dateAdded) : undefined],
    ['Times read', b.readCount ? String(b.readCount) : undefined],
    ['This edition', [b.publisher, b.year].filter(Boolean).join(', ') || undefined],
    ['ISBN', b.isbn13 ?? b.isbn],
  ];

  return (
    <>
      {picker.inputs}
      <div className="book-hero">
        <BookCover book={b} label className="book-hero-cover" />
        <IconMenu entries={entries} label={hasCover ? 'Change the cover' : 'Add a cover'} icon={<CameraIcon />} triggerClassName="icon-btn book-hero-btn" />
      </div>
      {(busy || picker.busy) && <p className="muted small book-center">Saving the cover…</p>}
      {(message || picker.error) && <p className="small book-center">{message || picker.error}</p>}

      <div className="book-head">
        <h1>{title}</h1>
        {series && <p className="muted small">{series}</p>}
        <p className="book-author">{authorLine(b)}</p>
        {b.avgRating != null && (
          <p className="book-avg">
            <span className="book-avg-star" aria-hidden>
              ★
            </span>
            <strong>{b.avgRating.toFixed(2)}</strong> <span className="muted small">Goodreads rating</span>
          </p>
        )}
        <IconMenu
          entries={shelfEntries}
          label={`Shelf: ${stateLine}. Change`}
          icon={
            <>
              {b.shelf === 'read' && <CheckIcon />}
              {stateLine}
              <ChevronDownIcon />
            </>
          }
          triggerClassName="book-status"
        />
      </div>

      <div className="book-rate">
        <span className="muted small">{b.rating ? 'Your rating' : 'Rate this book'}</span>
        <RatingInput rating={b.rating} onRate={(n) => void onSave(rate(b, n, new Date().toISOString()))} />
        {b.shelf === 'read' && (
          <label className="book-date">
            <span>{b.dateRead ? `Finished ${shortDate(b.dateRead)}` : 'Add the day you finished'}</span>
            <input
              type="date"
              value={b.dateRead ?? ''}
              max={today()}
              aria-label="Day you finished"
              onChange={(e) => e.target.value && void onSave(setFinished(b, e.target.value, today(), new Date().toISOString()))}
            />
          </label>
        )}
      </div>

      {figures.some(([, v]) => v) && (
        <dl className="book-figures">
          {figures.map(([k, v]) =>
            v ? (
              <div key={k}>
                <dd>{v}</dd>
                <dt className="muted small">{k}</dt>
              </div>
            ) : null,
          )}
        </dl>
      )}

      {b.shelves && (
        <div className="chips book-shelves" aria-label="Your shelves">
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

      {facts.some(([, v]) => v) && (
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
      )}
      <p className="muted small">
        {b.source === 'manual'
          ? 'Added here by hand.'
          : `From your Goodreads export. Import a newer export in Settings to update it${b.edited?.length ? '; what you changed here stays as you set it' : ''}.`}
      </p>
    </>
  );
}
