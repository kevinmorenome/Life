import { useState } from 'react';
import { SYNC_LABELS } from './SyncBadge';
import { downloadBlob, exportBackup, importBackup, mergeBackup } from './lib/backup';
import { getAll, notify, put } from './lib/db';
import { today } from './lib/format';
import { PREVIEW_LABEL } from './lib/preview';
import { sampleReviewItems } from './modules/clothes/sampleReview';
import { parseBadgeReport, planImport } from './modules/work/importers/badgeReport';
import type { WorkDay } from './modules/work/types';
import { useSettings } from './lib/settings';
import { syncNow } from './lib/sync';
import { useSyncStatus } from './lib/useSyncStatus';

export function Settings() {
  const [message, setMessage] = useState('');
  const [workMessage, setWorkMessage] = useState('');
  const sync = useSyncStatus();
  const { settings, update } = useSettings();

  // PR previews never push, so these stay on this device and never reach your real closet.
  async function addSamples() {
    for (const item of sampleReviewItems(new Date())) await put('clothes', item);
    notify('clothes');
    setMessage('Added 4 sample items to review. Open the closet to see them.');
  }

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

  async function onBadgeReport(file: File | undefined) {
    if (!file) return;
    try {
      const { days, skipped } = parseBadgeReport(await file.text(), new Date().toISOString());
      if (days.length === 0) throw new Error('No days found. Is this the badge report CSV?');
      const plan = planImport(days, await getAll<WorkDay>('workdays'));
      for (const day of plan.write) await put('workdays', day);
      notify('workdays');
      const parts = [`Imported ${plan.write.length} days`];
      if (plan.kept) parts.push(`${plan.kept} you set by hand were kept`);
      if (plan.unchanged) parts.push(`${plan.unchanged} were already up to date`);
      const other = Object.entries(skipped).filter(([label]) => label !== 'Weekend');
      if (other.length) parts.push(`skipped ${other.map(([label, n]) => `${n} “${label}”`).join(', ')}`);
      setWorkMessage(parts.join('; ') + '.');
    } catch (e) {
      setWorkMessage(e instanceof Error ? e.message : 'Import failed');
    }
  }

  async function onMerge(file: File | undefined) {
    if (!file) return;
    try {
      const n = await mergeBackup(file);
      setMessage(n ? `Imported ${n} new or updated records.` : 'Nothing new; everything in that file is already here.');
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
        <h2>Work</h2>
        <label className="field">
          <span className="muted small">Your monthly number of days.</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={31}
            value={settings.workTarget ?? 7}
            onChange={(e) => update({ workTarget: Math.min(31, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
          />
        </label>
        <label className="field">
          <span className="muted small">What it counts.</span>
          <select
            value={settings.workTargetKind ?? 'max-home'}
            onChange={(e) => update({ workTargetKind: e.target.value as 'min-office' | 'max-home' })}
          >
            <option value="max-home">At most this many home days</option>
            <option value="min-office">At least this many office days</option>
          </select>
        </label>
        {(settings.workTargetKind ?? 'max-home') === 'max-home' && (
          <label className="field">
            <span className="muted small">Home days you can request on top, as a total (flagged as needing approval).</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={31}
              value={settings.workExtended ?? 10}
              onChange={(e) => update({ workExtended: Math.min(31, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
            />
          </label>
        )}
        <p className="muted small">
          Import your badge report (CSV) to fill in past office, home, trip and off days. Days you set by hand are never replaced, and home
          days get no times, since the report only has placeholders for them.
        </p>
        <div className="form-actions start">
          <label className="btn">
            Import badge report
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => onBadgeReport(e.target.files?.[0])} />
          </label>
        </div>
        {workMessage && <p className="small">{workMessage}</p>}
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
      {PREVIEW_LABEL && (
        <section className="card">
          <h2>Preview tools</h2>
          <p className="muted small">Adds made-up “needs review” items so you can try the review flow. They stay on this device only.</p>
          <div className="form-actions start">
            <button className="btn" onClick={addSamples}>
              Add sample items to review
            </button>
          </div>
        </section>
      )}
      <section className="card">
        <h2>Backup & import</h2>
        <p className="muted small">
          Download a copy of all your data as a JSON file. <strong>Import items</strong> adds new and updated records from
          a file and keeps everything else; <strong>Restore</strong> replaces your data with the file’s.
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
