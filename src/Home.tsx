import { href } from './lib/router';
import { MODULES } from './modules';
import { WeekDigest } from './WeekDigest';

/** The More tab: this week, and the modules with pages of their own (Settings is the gear in the header). */
export function Home() {
  return (
    <>
      <WeekDigest />
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
      </ul>
    </>
  );
}
