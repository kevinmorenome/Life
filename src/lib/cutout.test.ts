import { describe, expect, it } from 'vitest';
import { hasTransparency, tidyCutout, type Pixels } from './cutout';

/** A transparent canvas with opaque red wherever `solid` says so. */
function image(w: number, h: number, solid: (x: number, y: number) => boolean): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) data.set([200, 30, 30, 255], (y * w + x) * 4);
    }
  }
  return { data, width: w, height: h };
}

const alphaAt = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];
const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) =>
  x >= x0 && x < x1 && y >= y0 && y < y1;

describe('hasTransparency', () => {
  it('tells a photo from a cut-out', () => {
    expect(hasTransparency(image(10, 10, () => true))).toBe(false);
    expect(hasTransparency(image(10, 10, rect(0, 0, 5, 10)))).toBe(true);
  });
});

describe('tidyCutout', () => {
  it('crops to the item with a small margin', () => {
    const out = tidyCutout(image(100, 100, rect(30, 20, 70, 80)), 0.05)!;
    expect(out.width).toBe(40 + 2 * 3);
    expect(out.height).toBe(60 + 2 * 3);
    expect(alphaAt(out, 0, 0)).toBe(0);
    expect(alphaAt(out, out.width >> 1, out.height >> 1)).toBe(255);
  });

  it('drops stray specks such as page text from a screenshot', () => {
    const item = rect(30, 20, 70, 60);
    const caption = rect(10, 90, 20, 93);
    const out = tidyCutout(image(100, 100, (x, y) => item(x, y) || caption(x, y)), 0)!;
    expect(out.width).toBe(40);
    expect(out.height).toBe(40);
  });

  it('keeps both shoes of a pair', () => {
    const left = rect(10, 40, 40, 60);
    const right = rect(60, 40, 88, 60);
    const out = tidyCutout(image(100, 100, (x, y) => left(x, y) || right(x, y)), 0)!;
    expect(out.width).toBe(78);
  });

  it('does not mutate the source', () => {
    const src = image(40, 40, rect(10, 10, 30, 30));
    const copy = Uint8ClampedArray.from(src.data);
    tidyCutout(src);
    expect(src.data).toEqual(copy);
  });

  it('returns null when nothing was kept', () => {
    expect(tidyCutout(image(20, 20, () => false))).toBeNull();
  });
});
