import { useEffect, useRef, useState } from 'react';
import { PlusIcon } from './icons';
import { href, navigate } from './lib/router';
import { MODULES } from './modules';
import { useScrollingDown } from './lib/useScrollDirection';
import { activeTab, APP_TABS, type AppTab } from './nav';

/** Instagram-style tab bar: a row of tabs that scrolls sideways, and a ＋ menu with every module's quick actions that stays put. */
export function BottomNav({ route }: { route: string[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Shrinks while scrolling down, grows back when scrolling up.
  const compact = useScrollingDown(route.join('/')) && !menuOpen;
  const active = activeTab(route);
  const actions = MODULES.flatMap((m) => m.actions);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // The tabs scroll sideways; the ＋ stays put. One glass lens slides to the active tab.
  const activeIndex = APP_TABS.findIndex((t) => t.id === active);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const tabEl = el?.children[0]?.children[activeIndex + 1] as HTMLElement | undefined;
    if (!el || !tabEl) return;
    const left = tabEl.offsetLeft - (el.clientWidth - tabEl.offsetWidth) / 2;
    el.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [activeIndex]);

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
      <nav className={`bottom-nav${compact ? ' bottom-nav-compact' : ''}`} aria-label="Main">
        <div className="tabs-scroll" ref={scroller}>
          <div className="tabs-track" style={{ ['--col' as string]: activeIndex }}>
            <span className="tab-lens" aria-hidden />
            {APP_TABS.map(tab)}
          </div>
        </div>
        <button
          className="tab-plus"
          aria-label="Add"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <PlusIcon />
        </button>
      </nav>
    </>
  );
}
