import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronIcon } from './icons';
import { COLLAPSED_KEY, parseCollapsed, serializeCollapsed, withCollapsed } from './lib/widgetState';

function readCollapsed(): Set<string> {
  try {
    return parseCollapsed(localStorage.getItem(COLLAPSED_KEY));
  } catch {
    return new Set();
  }
}

/** Collapsed or not, remembered per widget in this browser (a per-viewer convenience, so it is not synced). */
export function useWidgetCollapsed(id: string): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => readCollapsed().has(id));

  // Keep widgets in step when another one changes the stored list, or another tab does.
  useEffect(() => {
    const sync = () => setCollapsed(readCollapsed().has(id));
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [id]);

  const set = useCallback(
    (value: boolean) => {
      setCollapsed(value);
      try {
        localStorage.setItem(COLLAPSED_KEY, serializeCollapsed(withCollapsed(readCollapsed(), id, value)));
      } catch {
        /* storage unavailable: it just won't be remembered */
      }
    },
    [id],
  );
  return [collapsed, set];
}

interface Props {
  /** Stable id for remembering the collapsed state. */
  id: string;
  title: string;
  icon: ReactNode;
  /** Colour family: `widget-<tone>` in styles.css. */
  tone?: string;
  /** Count or short value next to the title, e.g. "2" or "€28.73". */
  badge?: ReactNode;
  /** One line shown under the title while collapsed, so a closed widget still tells you something. */
  summary?: ReactNode;
  /** `full` spans the whole row; `half` shares it. */
  size?: 'half' | 'full';
  /** A button in the header (next to, not inside, the toggle). */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * One tile of the day dashboard: a header that collapses the body, with a short summary when closed.
 * Tiles flow in a two-column grid (`.day-grid`); `full` ones take both columns.
 */
export function DayWidget({ id, title, icon, tone = 'accent', badge, summary, size = 'half', action, children }: Props) {
  const [collapsed, setCollapsed] = useWidgetCollapsed(id);
  const bodyId = `widget-${id}`;
  return (
    <section className={`widget widget-${tone} widget-${size}${collapsed ? ' is-collapsed' : ''}`}>
      <div className="widget-head">
        <button className="widget-toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => setCollapsed(!collapsed)}>
          <span className="widget-icon">{icon}</span>
          <h2 className="widget-title">{title}</h2>
          {badge != null && badge !== '' && <span className="widget-badge">{badge}</span>}
          <span className="widget-chevron">
            <ChevronIcon />
          </span>
        </button>
        {action}
      </div>
      {collapsed ? summary != null && summary !== '' && <p className="widget-summary">{summary}</p> : <div id={bodyId} className="widget-body">{children}</div>}
    </section>
  );
}
