import { useState, type ReactNode } from 'react';
import { swatchCss } from './colors';

/** Series colours: the app's accent and tones, so charts follow light/dark mode. */
export const TONES = ['var(--accent)', 'var(--tone-blue)', 'var(--tone-purple)', 'var(--tone-orange)', 'var(--tone-lime)'];

export function Toggle<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="chips chart-toggle" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A percentage as a ring with the number in the middle. */
export function Ring({ pct, caption, color = 'var(--accent)' }: { pct: number; caption: ReactNode; color?: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${pct} percent`}>
        <circle cx="60" cy="60" r={r} className="ring-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="ring-fill"
          style={{ stroke: color, strokeDasharray: `${(pct / 100) * c} ${c}` }}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className="ring-pct">{pct}%</span>
      <span className="ring-caption">{caption}</span>
    </div>
  );
}

export interface Slice {
  name: string;
  value: number;
}

/** A solid CSS colour for a named clothing colour; chart tones for unknown or multicolour names. */
function sliceColor(name: string, i: number): string {
  if (name === 'Other') return 'var(--muted)';
  const css = swatchCss(name);
  return css && !css.includes('gradient') ? css : TONES[i % TONES.length];
}

/** Donut with a legend; tap a legend row to highlight its slice. Slices use the clothing's own colours. */
export function Donut({ slices }: { slices: Slice[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = 44;
  const c = 2 * Math.PI * r;
  const shown = active != null ? slices[active] : null;
  let offset = 0;

  return (
    <div className="donut">
      <div className="donut-chart">
        <svg viewBox="0 0 120 120" role="img" aria-label="Colour breakdown">
          <circle cx="60" cy="60" r={r} className="ring-track donut-track" />
          {slices.map((s, i) => {
            const len = (s.value / total) * c;
            const gap = slices.length > 1 ? Math.min(2, len / 2) : 0;
            const el = (
              <circle
                key={s.name}
                cx="60"
                cy="60"
                r={r}
                className="donut-slice"
                style={{
                  stroke: sliceColor(s.name, i),
                  strokeDasharray: `${len - gap} ${c - len + gap}`,
                  strokeDashoffset: -offset,
                  opacity: active == null || active === i ? 1 : 0.25,
                }}
                transform="rotate(-90 60 60)"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <span className="donut-center">
          <strong>{shown ? Math.round((shown.value / total) * 100) + '%' : total}</strong>
          <span>{shown ? shown.name : 'colours'}</span>
        </span>
      </div>
      <ul className="legend">
        {slices.map((s, i) => (
          <li key={s.name}>
            <button type="button" aria-pressed={active === i} onClick={() => setActive(active === i ? null : i)}>
              <span className="legend-dot" style={{ background: sliceColor(s.name, i) }} />
              <span className="legend-name">{s.name}</span>
              <span className="legend-value">{s.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface Bar {
  key: string;
  /** Short axis label. */
  tick: string;
  value: number;
}

/** Column chart; tap a column to read it out above the chart. */
export function Columns({
  bars,
  selected,
  onSelect,
  color = 'var(--accent)',
  describe,
}: {
  bars: Bar[];
  selected: string;
  onSelect: (key: string) => void;
  color?: string;
  describe: (b: Bar) => string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="columns" style={{ ['--bar' as string]: color }}>
      {bars.map((b) => (
        <button
          key={b.key}
          type="button"
          className="column"
          aria-pressed={b.key === selected}
          aria-label={describe(b)}
          onClick={() => onSelect(b.key)}
        >
          <span className="column-plot">
            <span className="column-fill" style={{ height: b.value ? `${Math.max(4, (b.value / max) * 100)}%` : '0' }} />
          </span>
          <span className="column-tick">{b.tick}</span>
        </button>
      ))}
    </div>
  );
}

export interface HBarRow {
  key: string;
  label: string;
  sub?: string;
  value: number;
  shown: string;
}

/** Horizontal bars scaled to the largest value. */
export function HBars({ rows, color = 'var(--accent)' }: { rows: HBarRow[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="hbar-head">
            <span className="hbar-label">{r.label}</span>
            <span className="hbar-value">{r.shown}</span>
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
          {r.sub && <span className="hbar-sub">{r.sub}</span>}
        </li>
      ))}
    </ul>
  );
}
