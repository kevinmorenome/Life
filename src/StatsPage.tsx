import { useEffect, useRef } from 'react';
import { href } from './lib/router';
import { MODULES } from './modules';
import type { LifeModule } from './modules/types';

interface Entry {
  id: string;
  label: string;
  /** One module, or several that share a tab (`ModuleStats.group`), in module order. */
  members: LifeModule[];
}

/** One tab per module with stats; modules in the same group (Entertainment) share one, at the place of its first member. */
export function statsEntries(modules: readonly LifeModule[]): Entry[] {
  const entries: Entry[] = [];
  for (const m of modules) {
    if (!m.stats) continue;
    const group = m.stats.group;
    const shared = group && entries.find((e) => e.id === group.id);
    if (shared) shared.members.push(m);
    else entries.push({ id: group?.id ?? m.id, label: group?.label ?? m.stats.label, members: [m] });
  }
  return entries;
}

/** The Stats tab: one section per module that has stats, picked with the tabs on top. */
export function StatsPage({ subroute }: { subroute: string[] }) {
  const [id, ...rest] = subroute;
  const entries = statsEntries(MODULES);
  const current = entries.find((e) => e.id === id) ?? entries[0];
  const bar = useRef<HTMLDivElement>(null);
  // Keep the active tab in view: the row scrolls sideways when there are many tabs.
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !bar.current) return;
    const box = bar.current;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [current?.id]);
  if (!current) return <p className="muted">Nothing to show yet.</p>;

  const onCurrent = current.id === id;
  // In a shared tab the next path segment names the module; without a valid one the first member shows.
  const shared = current.members.length > 1;
  const member = (shared && current.members.find((m) => m.id === rest[0])) || current.members[0];
  const memberRest = onCurrent ? (shared ? rest.slice(1) : rest) : [];

  return (
    <>
      {entries.length > 1 && (
        <div ref={bar} className="seg seg-scroll" role="tablist" aria-label="Stats sections">
          {entries.map((e) => (
            <button
              key={e.id}
              type="button"
              role="tab"
              aria-selected={e.id === current.id}
              // Replace, so going back doesn't walk through every tab switch.
              onClick={() => window.location.replace(href(`/stats/${e.id}`))}
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
      {shared && (
        <div className="seg seg-sub" role="tablist" aria-label={`${current.label} stats`} style={{ ['--tabs' as string]: current.members.length }}>
          {current.members.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={m.id === member.id} onClick={() => window.location.replace(href(`/stats/${current.id}/${m.id}`))}>
              {m.stats!.label}
            </button>
          ))}
        </div>
      )}
      {member.stats!.render(shared && !(onCurrent && rest[0] === member.id) ? [] : memberRest)}
    </>
  );
}
