import { useEffect, useRef, useState, type ReactNode } from 'react';
import { href } from '../../lib/router';
import { DotsIcon } from './icons';

export interface MenuEntry {
  label: string;
  icon: ReactNode;
  /** Hash route to open; otherwise `onSelect` runs. */
  path?: string;
  onSelect?: () => void;
}

/** A round ⋮ button that opens a small floating menu; closes on outside tap or Escape. */
export function IconMenu({ entries, label = 'More', icon, triggerClassName = 'icon-action' }: { entries: MenuEntry[]; label?: string; icon?: ReactNode; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={box}>
      <button className={triggerClassName} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon ?? <DotsIcon />}
      </button>
      {open && (
        <div className="menu menu-end" role="menu">
          {entries.map((e) =>
            e.path ? (
              <a key={e.label} role="menuitem" className="menu-item" href={href(e.path)} onClick={() => setOpen(false)}>
                {e.icon} {e.label}
              </a>
            ) : (
              <button
                key={e.label}
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  e.onSelect?.();
                }}
              >
                {e.icon} {e.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
