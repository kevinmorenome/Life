import { useState } from 'react';
import { getAll, notify, put } from '../../lib/db';
import { parseGoodreads, planImport } from './importers/goodreads';
import type { Book } from './types';

/** Settings → Import from Goodreads: choose the CSV from Goodreads' Export Library. Importing the same file twice changes nothing. */
export function GoodreadsSection() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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
      setMessage(`Imported ${books.length} books: ${parts.join(', ')}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Import from Goodreads</h2>
      <p className="muted small">
        On Goodreads open My Books → Import and export → Export Library, then choose the CSV it gives you. Shelves, ratings, reviews and the day you finished each book come
        over; private notes never do. Import a newer export any time to update.
      </p>
      <div className="form-actions start">
        <label className={`btn${busy ? ' is-disabled' : ''}`}>
          {busy ? 'Importing…' : 'Choose Goodreads export'}
          <input type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {message && <p className="small">{message}</p>}
    </section>
  );
}
