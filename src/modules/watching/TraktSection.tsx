import { useEffect, useState } from 'react';
import { PREVIEW_LABEL } from '../../lib/preview';
import { disconnectTrakt, syncTrakt, traktStatus, type TraktStatus } from './traktClient';

const RESULTS: Record<string, string> = {
  ok: 'Connected to Trakt. Fetching your history…',
  state: 'The sign-in link expired or was opened elsewhere. Try again.',
  denied: 'Trakt sign-in was cancelled.',
  error: 'Something went wrong while connecting to Trakt. Try again.',
  token: 'Trakt didn’t give a token. Check the redirect URI in your Trakt API app.',
};

/** Connect Trakt and fetch the watch history, in Settings. Hidden in PR previews, which never write. */
export function TraktSection() {
  const [status, setStatus] = useState<TraktStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function run() {
    setBusy(true);
    const res = await syncTrakt();
    setMessage('error' in res ? res.error : `Fetched ${res.added} plays.`);
    setStatus(await traktStatus());
    setBusy(false);
  }

  useEffect(() => {
    void traktStatus().then(setStatus);
    // The callback sends you back here with the outcome in the query string: /?trakt=ok#/settings
    const result = new URLSearchParams(location.search).get('trakt');
    if (result) {
      history.replaceState(null, '', '/#/settings');
      setMessage(RESULTS[result] ?? 'Trakt sign-in failed.');
      if (result === 'ok') void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (PREVIEW_LABEL || !status?.configured) return null;

  return (
    <section className="card">
      <h2>Trakt</h2>
      <p className="muted small">
        The movies and episodes you watched show on the calendar and in Stats. Read only: nothing is ever written to Trakt.
        {status.lastSync && <> Last fetched {new Date(status.lastSync).toLocaleString()}.</>}
      </p>
      <div className="form-actions start">
        {status.connected ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={run}>
              {busy ? 'Fetching…' : 'Fetch history'}
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                if (!confirm('Disconnect Trakt? Plays already fetched stay.')) return;
                await disconnectTrakt();
                setStatus(await traktStatus());
              }}
            >
              Disconnect
            </button>
          </>
        ) : (
          <a className="btn btn-primary" href="/api/trakt/connect">
            Connect Trakt
          </a>
        )}
      </div>
      {message && <p className="small">{message}</p>}
    </section>
  );
}
