import { useEffect, useState } from 'react';
import { PREVIEW_LABEL } from '../../lib/preview';
import { disconnectSwarm, swarmStatus, syncSwarm, type SwarmStatus } from './swarmClient';

const RESULTS: Record<string, string> = {
  ok: 'Connected to Swarm. Fetching your check-ins…',
  state: 'The sign-in link expired or was opened elsewhere. Try again.',
  denied: 'Swarm sign-in was cancelled.',
  token: 'Swarm didn’t give a token. Check the redirect URL in the Foursquare app settings.',
};

/** Connect Swarm and fetch check-ins, in Settings. Hidden in PR previews, which never write. */
export function SwarmSection() {
  const [status, setStatus] = useState<SwarmStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function run() {
    setBusy(true);
    const res = await syncSwarm();
    setMessage('error' in res ? res.error : `Fetched ${res.added} check-ins.`);
    setStatus(await swarmStatus());
    setBusy(false);
  }

  useEffect(() => {
    void swarmStatus().then(setStatus);
    // The callback sends you back here with the outcome in the query string: /?swarm=ok#/settings
    const result = new URLSearchParams(location.search).get('swarm');
    if (result) {
      history.replaceState(null, '', '/#/settings');
      setMessage(RESULTS[result] ?? 'Swarm sign-in failed.');
      if (result === 'ok') void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (PREVIEW_LABEL || !status?.configured) return null;

  return (
    <section className="card">
      <h2>Swarm</h2>
      <p className="muted small">
        Your Swarm check-ins show on the calendar. Read only: nothing is ever written to Swarm.
        {status.lastSync && <> Last fetched {new Date(status.lastSync).toLocaleString()}.</>}
      </p>
      <div className="form-actions start">
        {status.connected ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={run}>
              {busy ? 'Fetching…' : 'Fetch check-ins'}
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                if (!confirm('Disconnect Swarm? Check-ins already fetched stay.')) return;
                await disconnectSwarm();
                setStatus(await swarmStatus());
              }}
            >
              Disconnect
            </button>
          </>
        ) : (
          <a className="btn btn-primary" href="/api/swarm/connect">
            Connect Swarm
          </a>
        )}
      </div>
      {message && <p className="small">{message}</p>}
    </section>
  );
}
