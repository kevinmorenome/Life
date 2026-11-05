import { useState } from 'react';
import { getAll, notify, put } from '../../lib/db';
import { PREVIEW_LABEL } from '../../lib/preview';
import { syncNow } from '../../lib/sync';
import { parseTripList, tripsToImport } from './tripitImport';
import type { Trip } from './types';

/**
 * TripIt's calendar feed only lists upcoming trips, so past ones are copied out of TripIt's website in your own
 * browser (the snippet below, run in the console while signed in) and pasted here. Hidden in PR previews, which never write.
 */
export const BROWSER_SNIPPET = `(async () => {
  const csrf = document.cookie.match(/it_wa_csrf=([^;]+)/)?.[1] ?? '';
  const out = [];
  for (let page = 1; page <= 100; page++) {
    const res = await fetch('/api/v2/list/trip?exclude_types=weather&page_size=10&past=true&should_sort_trips_by_date=true&traveler=all&trip_permission_filter=all&page_num=' + page + '&isPast=true', {
      headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest', 'x-csrf-token-wa': csrf, 'x-tripit-app-info': 'web/0.0.2' },
    });
    if (!res.ok) { console.log('Stopped at page', page, 'status', res.status); break; }
    const data = await res.json();
    const trips = [].concat(data.Trip ?? []);
    if (trips.length === 0) break;
    for (const t of trips) out.push({ id: t.id, name: t.display_name, start: t.start_date, end: t.end_date, place: t.primary_location, country: t.PrimaryLocationAddress?.country });
  }
  copy(JSON.stringify(out));
  console.log(out.length + ' trips copied');
})();`;

export function TripitImportSection() {
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const parsed = parseTripList(text);
    if ('error' in parsed) {
      setMessage(parsed.error);
      setBusy(false);
      return;
    }
    const fresh = tripsToImport(parsed.trips, await getAll<Trip>('trips'), new Date().toISOString());
    for (const t of fresh) await put('trips', t);
    if (fresh.length) {
      notify('trips');
      await syncNow();
    }
    const there = parsed.trips.length - fresh.length;
    setMessage(
      `Added ${fresh.length} ${fresh.length === 1 ? 'trip' : 'trips'}` +
        (there ? `, ${there} already there` : '') +
        (parsed.skipped ? `, ${parsed.skipped} skipped (missing dates, or listed twice)` : '') +
        '.',
    );
    if (fresh.length) setText('');
    setBusy(false);
  }

  if (PREVIEW_LABEL) return null;

  return (
    <section className="card">
      <h2>Past TripIt trips</h2>
      <p className="muted small">
        TripIt’s calendar feed only lists upcoming trips. To bring in older ones, sign in at tripit.com, open its trip list, run the snippet below in the
        browser console (it only reads your own list), and paste the result here. Their countries count in Stats → Countries.
      </p>
      <details>
        <summary className="small">Show the snippet</summary>
        <pre className="small" style={{ whiteSpace: 'pre-wrap', userSelect: 'all' }}>{BROWSER_SNIPPET}</pre>
      </details>
      <label className="field">
        <span>Pasted trips</span>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder='[{"id":"…","name":"…","start":"2024-05-10", …}]' spellCheck={false} />
      </label>
      <div className="form-actions start">
        <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={run}>
          {busy ? 'Importing…' : 'Import trips'}
        </button>
      </div>
      {message && <p className="small" role="status">{message}</p>}
    </section>
  );
}
