import { useState } from 'react';
import { STORES, getAll } from './lib/db';
import {
  clearLongTasks,
  formatSize,
  longTaskSupported,
  sizeReport,
  summarizeLongTasks,
  type LongTaskSummary,
  type StoreSize,
} from './lib/perf';

interface Row extends StoreSize {
  store: string;
  ms: number;
}

/** Settings → Performance: what each store weighs and how long loading it takes on this device. */
export function PerfSection() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tasks, setTasks] = useState<LongTaskSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function measure() {
    setBusy(true);
    const out: Row[] = [];
    for (const store of STORES) {
      const t0 = performance.now();
      const all = await getAll(store);
      const ms = Math.round(performance.now() - t0);
      out.push({ store, ms, ...sizeReport(all) });
    }
    out.sort((a, b) => b.chars - a.chars);
    setRows(out.filter((r) => r.records > 0));
    setTasks(summarizeLongTasks());
    setBusy(false);
  }

  const total = rows?.reduce((n, r) => n + r.chars, 0) ?? 0;
  const images = rows?.reduce((n, r) => n + r.imageChars, 0) ?? 0;

  return (
    <section className="card">
      <h2>Performance</h2>
      <p className="muted small">
        Shows how much data each part of the app loads and how long that takes here. Use it on your phone while the app feels slow.
      </p>
      <div className="form-actions start">
        <button className="btn" disabled={busy} onClick={measure}>
          {rows ? 'Measure again' : 'Measure'}
        </button>
        {tasks && (
          <button
            className="btn"
            onClick={() => {
              clearLongTasks();
              setTasks(summarizeLongTasks());
            }}
          >
            Reset freezes
          </button>
        )}
      </div>
      {rows && (
        <>
          <p className="small">
            Everything: <strong>{formatSize(total)}</strong>, of which pictures <strong>{formatSize(images)}</strong> (
            {total ? Math.round((images / total) * 100) : 0}%).
          </p>
          <table className="small perf-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Records</th>
                <th>Size</th>
                <th>Pictures</th>
                <th>Load</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.store}>
                  <td>{r.store}</td>
                  <td>{r.records}</td>
                  <td>{formatSize(r.chars)}</td>
                  <td>{r.imageChars ? formatSize(r.imageChars) : '–'}</td>
                  <td>{r.ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {tasks && (
        <div className="small">
          <p>
            {longTaskSupported()
              ? `Freezes over 50 ms since the app opened: ${tasks.count} (${Math.round(tasks.totalMs)} ms in total, worst ${tasks.worstMs} ms).`
              : 'This browser does not report freezes (long tasks); only the table above is available.'}
          </p>
          {tasks.worst.length > 0 && (
            <ul>
              {tasks.worst.map((t, i) => (
                <li key={i}>
                  {t.ms} ms on <code>{t.route}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
