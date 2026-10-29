import { useEffect, useState } from 'react';
import { PlusIcon } from './icons';
import { href, navigate } from './lib/router';
import { MODULES } from './modules';
import { activeTab, APP_TABS, type AppTab } from './nav';

/** Instagram-style tab bar: two tabs, a ＋ menu with every module's quick actions, two tabs. */
export function BottomNav({ route }: { route: string[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const active = activeTab(route);
  const half = Math.ceil(APP_TABS.length / 2);
  const actions = MODULES.flatMap((m) => m.actions);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const tab = (t: AppTab) => (
    <a key={t.id} href={href(t.path)} className="tab" aria-label={t.label} aria-current={active === t.id ? 'page' : undefined}>
      {t.icon}
    </a>
  );

  return (
    <>
      {menuOpen && (
        <div className="sheet-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="sheet" role="menu" onClick={(e) => e.stopPropagation()}>
            {actions.map((a) => (
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
      <nav className="bottom-nav" aria-label="Main">
        {APP_TABS.slice(0, half).map(tab)}
        <button
          className="tab-plus"
          aria-label="Add"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <PlusIcon />
        </button>
        {APP_TABS.slice(half).map(tab)}
      </nav>
    </>
  );
}
