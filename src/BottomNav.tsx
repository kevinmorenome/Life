import { useEffect, useRef, useState } from 'react';
import { PlusIcon } from './icons';
import { href, navigate } from './lib/router';
import type { LifeModule } from './modules/types';

/** Instagram-style tab bar: two tabs, a ＋ menu, two tabs. */
export function BottomNav({ module, subroute }: { module: LifeModule; subroute: string[] | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const half = Math.ceil(module.tabs.length / 2);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const [tabMenu, setTabMenu] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);

  useEffect(() => {
    if (!tabMenu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as Element).closest('.tab-menu')) setTabMenu(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [tabMenu]);

  const tab = (t: LifeModule['tabs'][number]) => {
    const active = subroute !== null && t.matches(subroute);
    const link = (
      <a
        href={href(t.path)}
        className="tab"
        aria-label={t.label}
        aria-current={active ? 'page' : undefined}
        aria-haspopup={t.longPress ? 'menu' : undefined}
        onPointerDown={
          t.longPress
            ? () => {
                longPressed.current = false;
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => {
                  longPressed.current = true;
                  setTabMenu(t.id);
                }, 450);
              }
            : undefined
        }
        onPointerUp={t.longPress ? () => window.clearTimeout(timer.current) : undefined}
        onPointerLeave={t.longPress ? () => window.clearTimeout(timer.current) : undefined}
        onPointerCancel={t.longPress ? () => window.clearTimeout(timer.current) : undefined}
        onContextMenu={t.longPress ? (e) => e.preventDefault() : undefined}
        onClick={
          t.longPress
            ? (e) => {
                // The release after a long press must not also navigate to the tab.
                if (longPressed.current) {
                  e.preventDefault();
                  longPressed.current = false;
                }
              }
            : undefined
        }
      >
        {t.icon}
      </a>
    );
    if (!t.longPress) return <span key={t.id} className="tab-slot">{link}</span>;
    return (
      <span key={t.id} className="tab-slot">
        {link}
        {tabMenu === t.id && (
          <div className="menu tab-menu" role="menu">
            {t.longPress.map((a) => (
              <button
                key={a.label}
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setTabMenu(null);
                  navigate(a.path());
                }}
              >
                {a.icon}
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </span>
    );
  };

  return (
    <>
      {menuOpen && (
        <div className="sheet-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="sheet" role="menu" onClick={(e) => e.stopPropagation()}>
            {module.actions.map((a) => (
              <button
                key={a.label}
                role="menuitem"
                className="sheet-item"
                onClick={() => {
                  setMenuOpen(false);
                  navigate(a.path());
                }}
              >
                {a.icon}
                <span>{a.label}</span>
              </button>
            ))}
            <button className="sheet-item sheet-cancel" onClick={() => setMenuOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <nav className="bottom-nav" aria-label={module.title}>
        {module.tabs.slice(0, half).map(tab)}
        <button
          className="tab-plus"
          aria-label="Add"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <PlusIcon />
        </button>
        {module.tabs.slice(half).map(tab)}
      </nav>
    </>
  );
}
