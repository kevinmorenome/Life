import { useEffect, useState } from 'react';
import { getAll, notify, put } from '../../lib/db';
import { needsCover } from './cover';
import { parseGoodreads, planImport } from './importers/goodreads';
import type { Book } from './types';
import { useFindCovers } from './useFindCovers';

/**
 * Settings → Import from Goodreads: choose the CSV from Goodreads' Export Library. Importing the same file twice changes nothing.
 * Covers are not in the export: after an import, and from the button, they are looked up on Open Library.
 */
export function GoodreadsSection() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const covers = useFindCovers();
  const [withoutCovers, setWithoutCovers] = useState(0);

  const countMissing = () => getAll<Book>('books').then((all) => setWithoutCovers(all.filter(needsCover).length));
  useEffect(() => void countMissing(), []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { books, skipped } = parseGoodreads(await file.text(), new Date().toISOString());
      if (books.length === 0) throw new Error('No books found in that file.');
      const plan = planImport(books, await getAll<Book>('books'));
      for (const book of plan.write) await put('books', book);
      notify('books');
      const parts = [`${plan.added} new`, `${plan.updated} updated`, `${plan.unchanged} already up to date`];
      if (skipped) parts.push(`${skipped} rows skipped`);
      const done = `Imported ${books.length} books: ${parts.join(', ')}.`;
      setMessage(done);
      setMessage(`${done} ${await covers.find()}`.trim());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
      void countMissing();
    }
  }

  async function onCovers() {
    setBusy(true);
    setMessage('');
    try {
      setMessage(await covers.find());
    } finally {
      setBusy(false);
      void countMissing();
    }
  }

  return (
    <section className="card">
      <h2>Import from Goodreads</h2>
      <p className="muted small">
        On Goodreads open My Books → Import and export → Export Library, then choose the CSV it gives you. Shelves, ratings, reviews and the day you finished each book come
        over; private notes never do. Import a newer export any time to update. Covers are not in the export, so they are looked up on Open Library by ISBN, else by title and author.
      </p>
      <div className="form-actions start">
        <label className={`btn${busy ? ' is-disabled' : ''}`}>
          {busy ? 'Working…' : 'Choose Goodreads export'}
          <input type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {withoutCovers > 0 && (
          <button type="button" className="btn" disabled={busy} onClick={() => void onCovers()}>
            Find covers ({withoutCovers})
          </button>
        )}
      </div>
      {covers.progress && <p className="small" role="status">{covers.progress}</p>}
      {message && <p className="small">{message}</p>}
    </section>
  );
}
