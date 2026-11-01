import { href } from './lib/router';
import { MODULES } from './modules';

/** The Stats tab: one section per module that has stats, picked with the tabs on top. */
export function StatsPage({ subroute }: { subroute: string[] }) {
  const [id, ...rest] = subroute;
  const mods = MODULES.filter((m) => m.stats);
  const current = mods.find((m) => m.id === id) ?? mods[0];
  if (!current) return <p className="muted">Nothing to show yet.</p>;

  return (
    <>
      {mods.length > 1 && (
        <div className="seg" role="tablist" aria-label="Stats sections" style={{ ['--tabs' as string]: mods.length }}>
          {mods.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={m.id === current.id}
              // Replace, so going back doesn't walk through every tab switch.
              onClick={() => window.location.replace(href(`/stats/${m.id}`))}
            >
              {m.stats!.label}
            </button>
          ))}
        </div>
      )}
      {current.stats!.render(current.id === id ? rest : [])}
    </>
  );
}
