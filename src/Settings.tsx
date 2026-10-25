import { useState } from 'react';
import { downloadBlob, exportBackup, importBackup } from './lib/backup';
import { today } from './lib/format';

export function Settings() {
  const [message, setMessage] = useState('');

  async function onExport() {
    downloadBlob(await exportBackup(), `life-backup-${today()}.json`);
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    if (!confirm('Restoring replaces the data currently in this browser. Continue?')) return;
    try {
      const n = await importBackup(file);
      setMessage(`Restored ${n} records. Reloading…`);
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed');
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <section className="card">
        <h2>Backup</h2>
        <p className="muted small">
          Your data lives only in this browser on this device. Export a backup regularly, and use it to move
          your data to another device.
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
