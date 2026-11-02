import { useEffect, useRef, useState } from 'react';
import { PREVIEW_LABEL } from '../../lib/preview';
import { disconnectTrakt, pollDevice, startDevice, syncTrakt, traktStatus, type DeviceCode, type TraktStatus } from './traktClient';

const ENDED: Record<string, string> = {
  expired: 'The code expired. Connect again to get a new one.',
  denied: 'Trakt sign-in was cancelled.',
  error: 'Something went wrong while connecting to Trakt. Try again.',
};

/** Connect Trakt with a device code and fetch the watch history, in Settings. Hidden in PR previews, which never write. */
export function TraktSection() {
  const [status, setStatus] = useState<TraktStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [code, setCode] = useState<DeviceCode | null>(null);
  // Bumped to cancel a running wait (on unmount, or when a new attempt starts).
  const attempt = useRef(0);

  async function fetchHistory() {
    setBusy(true);
    const res = await syncTrakt();
    setMessage('error' in res ? res.error : `Fetched ${res.added} plays.`);
    setStatus(await traktStatus());
    setBusy(false);
  }

  /** Waits for the code to be entered at trakt.tv/activate, asking at the pace Trakt gives. */
  async function connect() {
    const mine = ++attempt.current;
    setMessage('');
    const started = await startDevice();
    if ('error' in started) return setMessage(started.error);
    setCode(started);
    let wait = started.interval;
    const until = Date.now() + started.expiresIn * 1000;
    while (attempt.current === mine && Date.now() < until) {
      await new Promise((r) => setTimeout(r, wait * 1000));
      if (attempt.current !== mine) return;
      const result = await pollDevice(started.deviceCode);
      if (result === 'slow_down') wait += 5;
      if (result === 'ok') {
        setCode(null);
        setMessage('Connected to Trakt. Fetching your history…');
        setStatus(await traktStatus());
        return fetchHistory();
      }
      if (result !== 'pending' && result !== 'slow_down') {
        setCode(null);
        return setMessage(ENDED[result] ?? ENDED.error);
      }
    }
    if (attempt.current === mine) {
      setCode(null);
      setMessage(ENDED.expired);
    }
  }

  useEffect(() => {
    void traktStatus().then(setStatus);
    return () => {
      attempt.current++;
    };
  }, []);

  if (PREVIEW_LABEL || !status?.configured) return null;

  return (
    <section className="card">
      <h2>Trakt</h2>
      <p className="muted small">
        The movies and episodes you watched show on the calendar and in Stats. Read only: nothing is ever written to Trakt.
        {status.lastSync && <> Last fetched {new Date(status.lastSync).toLocaleString()}.</>}
      </p>
      {code ? (
        <>
          <p className="small">
            Open{' '}
            <a href={code.verificationUrl} target="_blank" rel="noreferrer">
              {code.verificationUrl.replace(/^https?:\/\//, '')}
            </a>{' '}
            and enter this code:
          </p>
          <p className="trakt-code" aria-live="polite">
            {code.userCode}
          </p>
          <p className="muted small">Waiting for you to approve it on Trakt…</p>
          <div className="form-actions start">
            <button
              className="btn"
              onClick={() => {
                attempt.current++;
                setCode(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="form-actions start">
          {status.connected ? (
            <>
              <button className="btn btn-primary" disabled={busy} onClick={fetchHistory}>
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
            <button className="btn btn-primary" onClick={connect}>
              Connect Trakt
            </button>
          )}
        </div>
      )}
      {message && <p className="small">{message}</p>}
    </section>
  );
}
