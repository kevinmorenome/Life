import { useEffect, useState } from 'react';
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

  const tab = (t: LifeModule['tabs'][number]) => {
    const active = subroute !== null && t.matches(subroute);
    return (
      <a key={t.id} href={href(t.path)} className="tab" aria-current={active ? 'page' : undefined}>
        {t.icon}
        <span>{t.label}</span>
      </a>
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
