import { useEffect, useState } from 'react';
import { PREVIEW_LABEL } from '../../lib/preview';
import { describeFeed, syncTripit, tripitStatus, type TripitStatus } from './tripitClient';

/** Fetch TripIt trips, in Settings. The feed link is the Worker secret TRIPIT_FEED_URL; hidden until it is set, and in PR previews, which never write. */
export function TripitSection() {
  const [status, setStatus] = useState<TripitStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void tripitStatus().then(setStatus);
  }, []);

  async function fetchNow() {
    setBusy(true);
    const res = await syncTripit();
    setMessage('error' in res ? res.error : `Found ${res.plans} plans. ${res.trips} new ${res.trips === 1 ? 'trip' : 'trips'} added.${describeFeed(res.feed)}`);
    setStatus(await tripitStatus());
    setBusy(false);
  }

  if (PREVIEW_LABEL || !status?.configured) return null;

  return (
    <section className="card">
      <h2>TripIt</h2>
      <p className="muted small">
        Your TripIt trips and plans, read only: nothing is ever written to TripIt. Each trip gets a packing list and an itinerary. TripIt’s feed only lists upcoming trips; ones already fetched stay here after they pass.
        {status.lastSync && <> Last fetched {new Date(status.lastSync).toLocaleString()}.</>}
      </p>
      <div className="form-actions start">
        <button className="btn btn-primary" disabled={busy} onClick={fetchNow}>
          {busy ? 'Fetching…' : 'Fetch trips'}
        </button>
      </div>
      {message && <p className="small" role="status">{message}</p>}
    </section>
  );
}
