import { useEffect, useState } from 'react';
import type { CountryEntry } from './countries';
import { geometryPath, MAP_HEIGHT, MAP_WIDTH, toScreen, type Geometry } from './worldMap';

interface Shape {
  numeric: string;
  name: string;
  d: string;
}

// Built once, the first time the map is shown (the map data is a separate chunk).
let shapes: Promise<Shape[]> | undefined;
function loadShapes(): Promise<Shape[]> {
  shapes ??= Promise.all([import('topojson-client'), import('world-atlas/countries-110m.json')]).then(([{ feature }, topo]) => {
    const t = topo.default as unknown as Parameters<typeof feature>[0];
    const fc = feature(t, (t as unknown as { objects: { countries: never } }).objects.countries) as unknown as {
      features: { id?: string; properties: { name: string }; geometry: Geometry }[];
    };
    return fc.features
      .filter((f) => f.id && f.id !== '010')
      .map((f) => ({ numeric: String(f.id).padStart(3, '0'), name: f.properties.name, d: geometryPath(f.geometry) }))
      .filter((s) => s.d);
  });
  return shapes;
}

/** The world with the countries you've been to filled in. Countries too small for the map get a dot. */
export function WorldMap({ entries }: { entries: CountryEntry[] }) {
  const [list, setList] = useState<Shape[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadShapes().then(
      (s) => !cancelled && setList(s),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="muted small">The map couldn't be loaded.</p>;
  const visited = new Set(entries.map((e) => e.country.numeric));
  const onMap = new Set((list ?? []).map((s) => s.numeric));
  // Visited countries the map has no shape for (Vatican, Monaco, Singapore…).
  const dots = entries.filter((e) => !onMap.has(e.country.numeric)).map((e) => e.country);
  return (
    <svg
      className="world-map"
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="img"
      aria-label={`World map with ${entries.length} ${entries.length === 1 ? 'country' : 'countries'} filled in`}
    >
      {(list ?? []).map((s) => (
        <path key={s.numeric} d={s.d} className={visited.has(s.numeric) ? 'wm-country wm-visited' : 'wm-country'}>
          <title>{s.name}</title>
        </path>
      ))}
      {list &&
        dots.map((c) => {
          const [x, y] = toScreen(c.lng, c.lat);
          return (
            <circle key={c.code} cx={x} cy={y} r={5} className="wm-visited wm-dot">
              <title>{c.name}</title>
            </circle>
          );
        })}
    </svg>
  );
}

