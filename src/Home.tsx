import { GearIcon } from './icons';
import { href } from './lib/router';
import { MODULES } from './modules';

/** The More tab: modules with pages of their own, and Settings. */
export function Home() {
  return (
    <>
      <ul className="module-grid">
        {MODULES.filter((m) => m.listed !== false).map((m) => (
          <li key={m.id}>
            <a className="card module-card" href={href(`/${m.id}`)}>
              <span className="module-icon" aria-hidden>
                {m.icon}
              </span>
              <strong>{m.title}</strong>
              <span className="muted small">{m.description}</span>
            </a>
          </li>
        ))}
        <li>
          <a className="card module-card" href={href('/settings')}>
            <span className="module-icon" aria-hidden>
              <GearIcon />
            </span>
            <strong>Settings</strong>
            <span className="muted small">Currency, office days, sync, backup and import.</span>
          </a>
        </li>
      </ul>
    </>
  );
}
