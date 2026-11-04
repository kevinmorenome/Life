// Performance diagnostics: how heavy each store is, and how often the main thread was blocked.
// Pure helpers (sizeReport) are unit tested; the long-task log is a tiny browser-only collector.

export interface StoreSize {
  records: number;
  /** Size of all records as JSON, in characters (about bytes for this data). */
  chars: number;
  /** Characters spent on embedded images (`data:` URLs). */
  imageChars: number;
  /** The biggest single record. */
  maxChars: number;
}

/** Characters used by `data:` URL strings anywhere inside a value. */
export function imageChars(value: unknown): number {
  if (typeof value === 'string') return value.startsWith('data:') ? value.length : 0;
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + imageChars(v), 0);
  if (value && typeof value === 'object') {
    return Object.values(value).reduce<number>((n, v) => n + imageChars(v), 0);
  }
  return 0;
}

export function sizeReport(records: unknown[]): StoreSize {
  let chars = 0;
  let images = 0;
  let max = 0;
  for (const r of records) {
    const c = JSON.stringify(r).length;
    chars += c;
    images += imageChars(r);
    if (c > max) max = c;
  }
  return { records: records.length, chars, imageChars: images, maxChars: max };
}

export function formatSize(chars: number): string {
  if (chars < 1024) return `${chars} B`;
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(0)} KB`;
  return `${(chars / 1024 / 1024).toFixed(1)} MB`;
}

// ---- Long tasks: stretches over 50 ms where the page couldn't react ----

export interface LongTaskSummary {
  count: number;
  totalMs: number;
  worstMs: number;
  /** Longest tasks first, with the route they happened on. */
  worst: { ms: number; at: number; route: string }[];
}

const tasks: { ms: number; at: number; route: string }[] = [];

export function startLongTaskLog(): void {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        tasks.push({ ms: Math.round(e.duration), at: Math.round(e.startTime), route: location.hash || '#/' });
      }
      if (tasks.length > 500) tasks.splice(0, tasks.length - 500);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // Not supported (Safari): the section says so.
  }
}

export function longTaskSupported(): boolean {
  return typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');
}

export function summarizeLongTasks(list: { ms: number; at: number; route: string }[] = tasks): LongTaskSummary {
  const sorted = [...list].sort((a, b) => b.ms - a.ms);
  return {
    count: list.length,
    totalMs: list.reduce((n, t) => n + t.ms, 0),
    worstMs: sorted[0]?.ms ?? 0,
    worst: sorted.slice(0, 5),
  };
}

export function clearLongTasks(): void {
  tasks.length = 0;
}
