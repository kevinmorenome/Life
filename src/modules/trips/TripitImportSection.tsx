import { useState } from 'react';
import { getAll, notify, put } from '../../lib/db';
import { PREVIEW_LABEL } from '../../lib/preview';
import { syncNow } from '../../lib/sync';
import { parseTripList, plansToImport, tripsToImport } from './tripitImport';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Trip } from './types';

/**
 * TripIt's calendar feed only lists upcoming trips, so past ones are copied out of TripIt's website in your own
 * browser (the snippet below, run in the console while signed in) and pasted here. Hidden in PR previews, which never write.
 */
export const BROWSER_SNIPPET = `(async () => {
  // Only these fields are kept: no names, emails, birthdays, booking numbers or links ever leave this tab.
  const KEEP = new Set(['id', 'display_name', 'start_date', 'end_date', 'primary_location', 'PrimaryLocationAddress', 'country', 'city', 'supplier_name', 'StartDateTime', 'EndDateTime', 'DateTime', 'date', 'time', 'Address', 'StartLocationAddress', 'EndLocationAddress', 'StartStationAddress', 'EndStationAddress', 'Segment', 'start_airport_code', 'end_airport_code', 'start_city_name', 'end_city_name', 'start_country_code', 'end_country_code', 'marketing_airline_code', 'marketing_flight_number']);
  const pick = (v) => Array.isArray(v) ? v.map(pick) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => KEEP.has(k)).map(([k, x]) => [k, pick(x)])) : v;
  const csrf = document.cookie.match(/it_wa_csrf=([^;]+)/)?.[1] ?? '';
  const headers = { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest', 'x-csrf-token-wa': csrf, 'x-tripit-app-info': 'web/0.0.2' };
  const trips = [];
  for (let page = 1; page <= 100; page++) {
    const res = await fetch('/api/v2/list/trip?exclude_types=weather&page_size=10&past=true&should_sort_trips_by_date=true&traveler=all&trip_permission_filter=all&page_num=' + page + '&isPast=true', { headers });
    // A 404 just means there is no such page: the list has ended.
    if (!res.ok) { if (res.status !== 404) console.log('Stopped at page', page, 'status', res.status); break; }
    const body = await res.json();
    const list = [].concat(body.Trip ?? []);
    if (list.length === 0) break;
    trips.push(...list.map((t) => ({ id: t.id, uuid: t.uuid })));
    if (page >= Number(body.max_page || 0)) break;
  }
  console.log(trips.length + ' trips found');
  const out = [];
  for (const t of trips) {
    const res = await fetch('/api/v2/get/trip/uuid/' + t.uuid + '/include_objects/true?exclude_types=weather&should_get_new_seat_tracker_subscriptions=true', { headers });
    if (!res.ok) { console.log('Skipped trip', t.id, 'status', res.status); continue; }
    const detail = await res.json();
    const kept = {};
    for (const k of Object.keys(detail)) if (k === 'Trip' || k.endsWith('Object')) kept[k] = pick(detail[k]);
    out.push(kept);
    console.log(out.length + ' of ' + trips.length);
    await new Promise((r) => setTimeout(r, 150));
  }
  // A file, because copy() is not there in every console: choose it with Choose file in Life.
  const json = JSON.stringify(out);
  try { copy(json); } catch (e) { /* not available here */ }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  link.download = 'tripit-trips.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  console.log(out.length + ' trips with their plans: tripit-trips.json downloaded');
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
    // The plans of each trip (flights, stays, activities) go in the same store as the calendar feed's plans.
    const freshPlans = plansToImport(parsed.plans, await getAll<TripitPlan>('tripitplans'));
    for (const p of freshPlans) await put('tripitplans', p);
    if (fresh.length || freshPlans.length) {
      notify('trips');
      notify('tripitplans');
      await syncNow();
    }
    const there = parsed.trips.length - fresh.length;
    setMessage(
      `Added ${fresh.length} ${fresh.length === 1 ? 'trip' : 'trips'}` +
        (freshPlans.length ? ` and ${freshPlans.length} ${freshPlans.length === 1 ? 'plan' : 'plans'}` : '') +
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
        TripIt’s calendar feed only lists upcoming trips. To bring in older ones with their plans (flights, stays, activities), sign in at tripit.com and run
        the snippet below in the browser console. It reads only your own trips and keeps just dates, places and countries (no names, emails or booking
        numbers). Then choose the downloaded file (tripit-trips.json) or paste the result here. Every plan’s country counts in Stats → Places → Countries like a check-in, and the plans fill
        each trip’s Itinerary.
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
        <label className="btn">
          Choose file
          <input
            type="file"
            accept=".json,application/json,text/plain"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
              e.target.value = '';
            }}
          />
        </label>
        <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={run}>
          {busy ? 'Importing…' : 'Import trips'}
        </button>
      </div>
      {message && <p className="small" role="status">{message}</p>}
    </section>
  );
}
