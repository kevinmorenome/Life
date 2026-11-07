import { describe, expect, it } from 'vitest';
import { geometryPath, MAP_HEIGHT, MAP_WIDTH, toScreen } from './worldMap';

describe('worldMap', () => {
  it('puts the edges and the centre where expected', () => {
    expect(toScreen(-180, 0)[0]).toBeCloseTo(0, 5);
    expect(toScreen(180, 0)[0]).toBeCloseTo(MAP_WIDTH, 5);
    expect(toScreen(0, 0)[0]).toBeCloseTo(MAP_WIDTH / 2, 5);
    expect(toScreen(0, 84)[1]).toBeCloseTo(0, 5);
    expect(toScreen(0, -58)[1]).toBeCloseTo(MAP_HEIGHT, 0);
  });
  it('puts north above south and east right of west', () => {
    expect(toScreen(0, 50)[1]).toBeLessThan(toScreen(0, -30)[1]);
    expect(toScreen(30, 0)[0]).toBeGreaterThan(toScreen(-30, 0)[0]);
  });
  it('builds a closed path and skips rings south of the map', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    expect(geometryPath({ type: 'Polygon', coordinates: [square] })).toMatch(/^M[\d. ]+(L[\d. ]+)+Z$/);
    const polar = [[0, -70], [10, -70], [10, -80], [0, -80], [0, -70]];
    expect(geometryPath({ type: 'Polygon', coordinates: [polar] })).toBe('');
  });
  it('does not draw a line across the map for a country that crosses 180°', () => {
    // A Fiji-like island group: points on both sides of the antimeridian.
    const ring = [[178, -16], [180, -16.5], [-179, -16.5], [-179, -18], [180, -18], [178, -18], [178, -16]];
    const d = geometryPath({ type: 'Polygon', coordinates: [ring] });
    const xs = [...d.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]));
    // Each drawn copy stays within a small stretch of the map, not spanning from one side to the other.
    const first = d.split('Z')[0];
    const fx = [...first.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]));
    expect(Math.max(...fx) - Math.min(...fx)).toBeLessThan(MAP_WIDTH / 10);
    expect(xs.length).toBeGreaterThan(fx.length);
  });
});
