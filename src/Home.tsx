import { href } from './lib/router';
import { MODULES } from './modules';

export function Home() {
  return (
    <>
      <h1>Life</h1>
      <p className="muted">Logs, inventories and stats about your life.</p>
      <ul className="module-grid">
        {MODULES.map((m) => (
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
