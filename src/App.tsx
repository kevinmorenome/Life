import { BottomNav } from './BottomNav';
import { Home } from './Home';
import { Settings } from './Settings';
import { PREVIEW_LABEL } from './lib/preview';
import { useRoute } from './lib/router';
import { SettingsProvider } from './lib/settings';
import { MODULES } from './modules';

export function App() {
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

  return (
    <SettingsProvider>
      {PREVIEW_LABEL && (
        <div className="preview-banner" role="status">
          <strong>Preview of {PREVIEW_LABEL}</strong> · shows your real data, but changes here aren’t saved
        </div>
      )}
      <main className={`container${showNav ? ' with-nav' : ''}`}>{page}</main>
      {showNav && <BottomNav module={navModule} subroute={mod ? subroute : null} settingsActive={section === 'settings'} />}
    </SettingsProvider>
  );
}
