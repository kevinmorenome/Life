import { useEffect, useState } from 'react';
import { PREVIEW_LABEL } from '../../lib/preview';
import { useSettings } from '../../lib/settings';
import { parseUser } from './music';
import { statsfmProfile, syncStatsfm } from './statsfmClient';

/** Connect stats.fm by its custom ID and fetch the listening history, in Settings. Hidden in PR previews, which never write. */
export function StatsfmSection() {
  const { settings, update } = useSettings();
  const user = settings.statsfmUser;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) setMessage('');
  }, [user]);

  async function fetchHistory(id: string) {
    setBusy(true);
    setMessage('Fetching your listening history…');
    const res = await syncStatsfm(id, (through) => setMessage(`Fetching your listening history… up to ${through}`));
    setMessage('error' in res ? res.error : `Done: ${res.days} ${res.days === 1 ? 'day' : 'days'} updated.`);
    setBusy(false);
  }

  async function connect() {
    const id = parseUser(input);
    if (!id) return setMessage('Paste your stats.fm profile link or custom ID.');
    setBusy(true);
    setMessage('');
    const profile = await statsfmProfile(id);
    if ('error' in profile) {
      setBusy(false);
      return setMessage(profile.error);
    }
    await update({ statsfmUser: id });
    setInput('');
    setBusy(false);
    await fetchHistory(id);
  }

  if (PREVIEW_LABEL) return null;

  return (
    <section className="card">
      <h2>stats.fm</h2>
      <p className="muted small">
        Your listening shows on the calendar and in Stats → Music, one summary per day. Read only: nothing is ever written to stats.fm. Your stats.fm profile and listening history must be public.
      </p>
      {user ? (
        <>
          <p className="small">
            Connected as <strong>{user}</strong>.
          </p>
          <div className="form-actions start">
            <button className="btn btn-primary" disabled={busy} onClick={() => void fetchHistory(user)}>
              {busy ? 'Fetching…' : 'Fetch history'}
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                if (!confirm('Disconnect stats.fm? Days already fetched stay.')) return;
                await update({ statsfmUser: undefined });
              }}
            >
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <input className="search" placeholder="stats.fm profile link or custom ID" aria-label="stats.fm profile link or custom ID" value={input} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setInput(e.target.value)} />
          <div className="form-actions start">
            <button className="btn btn-primary" disabled={busy || !input.trim()} onClick={() => void connect()}>
              {busy ? 'Connecting…' : 'Connect stats.fm'}
            </button>
          </div>
        </>
      )}
      {message && <p className="small" aria-live="polite">{message}</p>}
    </section>
  );
}
