import { BottomNav } from './BottomNav';
import { Home } from './Home';
import { Settings } from './Settings';
import { SyncBadge } from './SyncBadge';
import { GearIcon } from './icons';
import { PREVIEW_COMMIT, PREVIEW_LABEL } from './lib/preview';
import { href, useRoute } from './lib/router';
import { useHideOnScroll } from './lib/useHideOnScroll';
import { SettingsProvider } from './lib/settings';
import { MODULES } from './modules';

export function App() {
  const topbarHidden = useHideOnScroll();
  const [section, ...rest] = useRoute();
  // With a single module the app opens straight into it; Home returns once there are more.
  const singleModule = MODULES.length === 1;
  const mod = MODULES.find((m) => m.id === section) ?? (!section && singleModule ? MODULES[0] : undefined);
  const subroute = mod && section === mod.id ? rest : mod ? [] : null;

  let page;
  if (!section && !singleModule) page = <Home />;
  else if (section === 'settings') page = <Settings />;
  else if (mod && subroute) page = mod.render(subroute);
  else page = <p className="muted">Page not found.</p>;

  // Settings and Home keep the bar of the default module so you can always get back.
  const navModule = mod ?? MODULES[0];
  const showNav = !(mod && subroute && mod.hideNav?.(subroute));
  // The tab's name stands in for the page title: Closet only on its own landing page, since it also matches item pages.
  const pageTab =
    mod && subroute && showNav
      ? mod.tabs.find((t) => t.matches(subroute) && (t.id !== 'closet' || subroute.length === 0))
      : undefined;

  return (
    <SettingsProvider>
      {PREVIEW_LABEL && (
        <div className="preview-banner" role="status">
          <strong>Preview of {PREVIEW_LABEL}</strong>
          {PREVIEW_COMMIT && <> · {PREVIEW_COMMIT}</>}
        </div>
      )}
      <header className={`topbar${topbarHidden ? ' topbar-hidden' : ''}`}>
        <div className="brand-row">
          <a className="brand" href={href('/')}>
            Life
          </a>
          <SyncBadge />
          {pageTab && <h1 className="brand-page">{pageTab.label}</h1>}
        </div>
        <a
          className="icon-btn"
          href={href('/settings')}
          aria-label="Settings"
          aria-current={section === 'settings' ? 'page' : undefined}
        >
          <GearIcon />
        </a>
      </header>
      <main className={`container${showNav ? ' with-nav' : ''}`}>{page}</main>
      {showNav && <BottomNav module={navModule} subroute={mod ? subroute : null} />}
    </SettingsProvider>
  );
}
