import { useEffect, useState } from 'react';
import { PREVIEW_LABEL } from '../../lib/preview';
import { connectTripit, disconnectTripit, syncTripit, tripitStatus, type TripitStatus } from './tripitClient';

/** Connect TripIt (paste the private calendar feed link) and fetch trips, in Settings. Hidden in PR previews, which never write. */
export function TripitSection() {
  const [status, setStatus] = useState<TripitStatus | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void tripitStatus().then(setStatus);
  }, []);

  async function fetchNow() {
    setBusy(true);
    const res = await syncTripit();
    setMessage('error' in res ? res.error : `Found ${res.plans} plans. ${res.trips} new ${res.trips === 1 ? 'trip' : 'trips'} added.`);
    setStatus(await tripitStatus());
    setBusy(false);
  }

  async function connect() {
    setBusy(true);
    const res = await connectTripit(link);
    if (res) {
      setMessage(res.error);
      setBusy(false);
      return;
    }
    setLink('');
    setStatus(await tripitStatus());
    setBusy(false);
    await fetchNow();
  }

  if (PREVIEW_LABEL || !status) return null;

  return (
    <section className="card">
      <h2>TripIt</h2>
      <p className="muted small">
        Your TripIt trips and plans, read only: nothing is ever written to TripIt. Each trip gets a packing list and an itinerary.
        {status.lastSync && <> Last fetched {new Date(status.lastSync).toLocaleString()}.</>}
      </p>
      {status.connected ? (
        <div className="form-actions start">
          <button className="btn btn-primary" disabled={busy} onClick={fetchNow}>
            {busy ? 'Fetching…' : 'Fetch trips'}
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              if (!confirm('Disconnect TripIt? Trips and plans already fetched stay.')) return;
              await disconnectTripit();
              setStatus(await tripitStatus());
              setMessage('');
            }}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Calendar feed link</span>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.tripit.com/feed/ical/private/…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby="tripit-hint"
            />
          </label>
          <p id="tripit-hint" className="muted small">
            In TripIt: Settings → Calendar Feed → copy the link. It works like a password, so it stays on the server and is never synced to your devices.
          </p>
          <div className="form-actions start">
            <button className="btn btn-primary" disabled={busy || !link.trim()} onClick={connect}>
              {busy ? 'Connecting…' : 'Connect TripIt'}
            </button>
          </div>
        </>
      )}
      {message && <p className="small" role="status">{message}</p>}
    </section>
  );
}
