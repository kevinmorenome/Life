import { useState } from 'react';
import { SYNC_LABELS } from './SyncBadge';
import { downloadBlob, exportBackup, importBackup } from './lib/backup';
import { today } from './lib/format';
import { syncNow } from './lib/sync';
import { useSyncStatus } from './lib/useSyncStatus';

export function Settings() {
  const [message, setMessage] = useState('');
  const sync = useSyncStatus();

  async function onExport() {
    downloadBlob(await exportBackup(), `life-backup-${today()}.json`);
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    if (!confirm('Restoring replaces your current data on every synced device. Continue?')) return;
    try {
      const n = await importBackup(file);
      setMessage(`Restored ${n} records.`);
      await syncNow();
      location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed');
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <section className="card">
        <h2>Sync</h2>
        <p>
          <strong>{SYNC_LABELS[sync.state]}</strong>
          {sync.message && sync.state !== 'synced' && <span className="muted"> — {sync.message}</span>}
        </p>
        <p className="muted small">
          {sync.lastSynced ? `Last synced ${new Date(sync.lastSynced).toLocaleString()}. ` : 'Never synced. '}
          {sync.pending > 0 && `${sync.pending} change(s) waiting to upload.`}
        </p>
        {sync.state === 'local-only' && (
          <p className="muted small">
            No sync server is running here, so data is saved only in this browser.
          </p>
        )}
        <div className="form-actions start">
          {sync.state === 'signed-out' ? (
            <button className="btn btn-primary" onClick={() => location.reload()}>
              Sign in
            </button>
          ) : (
            <button className="btn" disabled={sync.state === 'syncing'} onClick={() => syncNow()}>
              Sync now
            </button>
          )}
        </div>
      </section>
      <section className="card">
        <h2>Backup</h2>
        <p className="muted small">
          Download a copy of all your data as a JSON file, or restore from one.
        </p>
        <div className="form-actions start">
          <button className="btn btn-primary" onClick={onExport}>
            Export backup
          </button>
          <label className="btn">
            Restore from file
            <input type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
          </label>
        </div>
        {message && <p className="small">{message}</p>}
      </section>
    </>
  );
}
