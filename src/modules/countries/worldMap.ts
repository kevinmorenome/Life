// Pure map maths: Equal Earth projection and SVG path building. Kept apart from React so it can be tested.

const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;
const rad = Math.PI / 180;

/** Equal Earth: lng/lat in degrees → x/y (y grows upwards, like latitude). */
export function project(lng: number, lat: number): [number, number] {
  const t = Math.asin(M * Math.sin(lat * rad));
  const t2 = t * t;
  const t6 = t2 * t2 * t2;
  const x = (2 * Math.sqrt(3) * lng * rad * Math.cos(t)) / (3 * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

/** The part of the world the map shows: all of it but most of Antarctica. */
const NORTH = 84;
const SOUTH = -58;
const [XMAX] = project(180, 0);
const [, YMAX] = project(0, NORTH);
const [, YMIN] = project(0, SOUTH);
/** Map units per SVG unit: the viewBox is about 1000 wide. */
const SCALE = 1000 / (2 * XMAX);

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = Math.round((YMAX - YMIN) * SCALE);

/** Screen position (SVG units) of a point. */
export function toScreen(lng: number, lat: number): [number, number] {
  const [x, y] = project(lng, Math.max(SOUTH, Math.min(NORTH, lat)));
  return [(x + XMAX) * SCALE, (YMAX - y) * SCALE];
}

type Ring = number[][];
export type Geometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** SVG path data for a (multi)polygon. Rings that lie entirely south of the map are dropped. */
export function geometryPath(g: Geometry): string {
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let d = '';
  for (const rings of polygons) {
    for (const ring of rings) {
      if (ring.every(([, lat]) => lat < SOUTH)) continue;
      d += ring.map(([lng, lat], i) => {
        const [x, y] = toScreen(lng, lat);
        return `${i === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)}`;
      }).join('') + 'Z';
    }
  }
  return d;
}
