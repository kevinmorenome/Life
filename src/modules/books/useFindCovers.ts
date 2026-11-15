import { useState } from 'react';
import { getAll, notify, put } from '../../lib/db';
import { today } from '../../lib/format';
import { fillCovers, lookupCover, needsCover } from './cover';
import type { Book } from './types';

/** Looks up the covers of every book that has none (Open Library, through the Worker) and says how it went. */
export function useFindCovers() {
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);

  /** Resolves to a sentence about the result ("" when there was nothing to look up). */
  async function find(): Promise<string> {
    setBusy(true);
    try {
      const all = await getAll<Book>('books');
      if (!all.some(needsCover)) return '';
      let saved = 0;
      const run = await fillCovers(all, {
        lookup: lookupCover,
        save: async (b) => {
          await put('books', b);
          if (++saved % 10 === 0) notify('books');
        },
        onProgress: (done, of) => setProgress(`Finding covers… ${done} of ${of}`),
        now: new Date().toISOString(),
        day: today(),
      });
      notify('books');
      const parts = [`found ${run.found} ${run.found === 1 ? 'cover' : 'covers'}`];
      if (run.missing) parts.push(`${run.missing} not on Open Library`);
      if (run.failed) parts.push('stopped because Open Library couldn’t be reached; try again later');
      return `Covers: ${parts.join(', ')}.`;
    } finally {
      setProgress('');
      setBusy(false);
    }
  }
  return { find, progress, busy };
}
