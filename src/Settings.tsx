import { useState } from 'react';
import { SYNC_LABELS } from './SyncBadge';
import { downloadBlob, exportBackup, importBackup, mergeBackup } from './lib/backup';
import { today } from './lib/format';
import { useSettings } from './lib/settings';
import { syncNow } from './lib/sync';
import { useSyncStatus } from './lib/useSyncStatus';

export function Settings() {
  const [message, setMessage] = useState('');
  const sync = useSyncStatus();
  const { settings, update } = useSettings();

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

  async function onMerge(file: File | undefined) {
    if (!file) return;
    try {
      const n = await mergeBackup(file);
      setMessage(n ? `Added ${n} new records.` : 'Nothing new to add; everything in that file is already here.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed');
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <section className="card">
        <h2>Currency</h2>
        <label className="field">
          <span className="muted small">Used to show all prices and totals.</span>
          <select value={settings.currency} onChange={(e) => update({ currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} — {currencyName(c)}
              </option>
            ))}
          </select>
        </label>
      </section>
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
        <h2>Backup & import</h2>
        <p className="muted small">
          Download a copy of all your data as a JSON file. <strong>Import items</strong> adds what’s new from a
          file and keeps everything you have; <strong>Restore</strong> replaces your data with the file’s.
        </p>
        <div className="form-actions start">
          <button className="btn btn-primary" onClick={onExport}>
            Export backup
          </button>
          <label className="btn">
            Import items
            <input type="file" accept="application/json,.json" hidden onChange={(e) => onMerge(e.target.files?.[0])} />
          </label>
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

const COMMON = ['USD', 'GBP', 'EUR', 'MXN', 'CAD', 'AUD', 'JPY', 'CHF'];
const CURRENCIES = [
  ...COMMON,
  ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : []).filter(
    (c) => !COMMON.includes(c),
  ),
];

function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}
