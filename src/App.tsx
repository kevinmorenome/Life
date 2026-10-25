import { Home } from './Home';
import { Settings } from './Settings';
import { SyncBadge } from './SyncBadge';
import { href, useRoute } from './lib/router';
import { SettingsProvider } from './lib/settings';
import { MODULES } from './modules';

export function App() {
  const [section, ...rest] = useRoute();
  const mod = MODULES.find((m) => m.id === section);

  let page;
  if (!section) page = <Home />;
  else if (section === 'settings') page = <Settings />;
  else if (mod) page = mod.render(rest);
  else page = <p className="muted">Page not found.</p>;

  return (
    <SettingsProvider>
      <header className="topbar">
        <div className="brand-row">
          <a className="brand" href={href('/')}>
            Life
          </a>
          <SyncBadge />
        </div>
        <nav>
          {MODULES.map((m) => (
            <a key={m.id} href={href(`/${m.id}`)} aria-current={m.id === section ? 'page' : undefined}>
              <span aria-hidden>{m.icon}</span> {m.title}
            </a>
          ))}
          <a href={href('/settings')} aria-current={section === 'settings' ? 'page' : undefined}>
            <span aria-hidden>⚙️</span>
            <span className="sr-only">Settings</span>
          </a>
        </nav>
      </header>
      <main className="container">{page}</main>
    </SettingsProvider>
  );
}
