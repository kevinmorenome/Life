import { useCallback, useEffect } from 'react';
import { BottomNav } from './BottomNav';
import { CalendarPage } from './CalendarPage';
import { Home } from './Home';
import { Settings } from './Settings';
import { StatsPage } from './StatsPage';
import { SyncBadge } from './SyncBadge';
import { GearIcon } from './icons';
import { legacyRedirect } from './lib/legacyRoutes';
import { PREVIEW_COMMIT, PREVIEW_LABEL } from './lib/preview';
import { parentRoute } from './lib/backRoute';
import { href, useRoute } from './lib/router';
import { useSwipeBack } from './lib/useSwipeBack';
import { SettingsProvider } from './lib/settings';
import { MODULES } from './modules';
import { activeTab } from './nav';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Title next to the app name on the main pages of each tab. */
function pageTitle(route: string[]): string | undefined {
  const [a, b] = route;
  if (!a || (a === 'calendar' && !DATE.test(b ?? ''))) return 'Calendar';
  if (a === 'stats') return 'Stats';
  if (a === 'games' && (!b || b === 'players' || b === 'titles')) return 'Games';
  if (a === 'more') return 'More';
  if (a === 'food' && !b) return 'Food';
  if (a === 'clothes' && !b) return 'Closet';
  if (a === 'clothes' && b === 'outfits' && route.length === 2) return 'Outfits';
  return undefined;
}

export function App() {
  const route = useRoute();
  const [section, ...rest] = route;
  const redirect = legacyRedirect(route);
  useEffect(() => {
    if (redirect) window.location.replace(href(redirect));
  }, [redirect]);

  const page$ = useCallback(() => document.querySelector<HTMLElement>('main.container'), []);
  useSwipeBack(redirect ? undefined : parentRoute(route), page$);

  const mod = MODULES.find((m) => m.id === section);
  let page;
  if (redirect) page = null;
  else if (!section || section === 'calendar') page = <CalendarPage subroute={rest} />;
  else if (section === 'stats') page = <StatsPage subroute={rest} />;
  else if (section === 'more') page = <Home />;
  else if (section === 'settings') page = <Settings subroute={rest} />;
  else if (mod) page = mod.render(rest);
  else page = <p className="muted">Page not found.</p>;

  const showNav = !(mod && mod.hideNav?.(rest)) && !(section === 'settings' && rest[0] === 'closet-review' && Boolean(rest[1]));
  // The month calendar fills the screen and scrolls inside itself.
  const fullCalendar = !redirect && (!section || section === 'calendar') && !DATE.test(rest[0] ?? '');
  const title = showNav ? pageTitle(route) : undefined;

  return (
    <SettingsProvider>
      {PREVIEW_LABEL && (
        <div className="preview-banner" role="status">
          <strong>Preview of {PREVIEW_LABEL}</strong>
          {PREVIEW_COMMIT && <> · {PREVIEW_COMMIT}</>}
        </div>
      )}
      <header className="topbar">
        <div className="brand-row">
          <a className="brand" href={href('/')}>
            Life
          </a>
          <SyncBadge />
          {title && <h1 className="brand-page">{title}</h1>}
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
      <main key={activeTab(route)} className={`container${showNav ? ' with-nav' : ''}${fullCalendar ? ' cal-full' : ''}`}>{page}</main>
      {showNav && <BottomNav route={route} />}
    </SettingsProvider>
  );
}
