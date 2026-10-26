import { describe, expect, it } from 'vitest';
import { cutOut, type Pixels } from './cutout';

function image(w: number, h: number, bg: number[], paint: (x: number, y: number) => number[] | null): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y) ?? bg;
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  return { data, width: w, height: h };
}

const alphaAt = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];

describe('cutOut', () => {
  const white = [250, 250, 250];
  const red = [200, 30, 30];

  it('crops to the item and makes the backdrop transparent', () => {
    const src = image(100, 100, white, (x, y) => (x >= 30 && x < 70 && y >= 20 && y < 80 ? red : null));
    const out = cutOut(src)!;
    expect(out.width).toBeLessThan(60);
    expect(out.height).toBeLessThan(75);
    expect(out.width).toBeGreaterThanOrEqual(40);
    expect(alphaAt(out, 0, 0)).toBe(0);
    expect(alphaAt(out, out.width >> 1, out.height >> 1)).toBe(255);
  });

  it('keeps backdrop-coloured areas enclosed by the item', () => {
    const src = image(100, 100, white, (x, y) => {
      if (x >= 45 && x < 55 && y >= 45 && y < 55) return white; // button-sized hole
      return x >= 20 && x < 80 && y >= 20 && y < 80 ? red : null;
    });
    const out = cutOut(src)!;
    expect(alphaAt(out, out.width >> 1, out.height >> 1)).toBe(255);
  });

  it('does not mutate the source', () => {
    const src = image(60, 60, white, (x, y) => (x >= 20 && x < 40 && y >= 20 && y < 40 ? red : null));
    const copy = Uint8ClampedArray.from(src.data);
    cutOut(src);
    expect(src.data).toEqual(copy);
  });

  it('gives up on a busy border', () => {
    const src = image(60, 60, white, (x, y) => ((x + y) % 2 ? [10, 10, 10] : [240, 240, 240]));
    expect(cutOut(src)).toBeNull();
  });

  it('gives up when there is nothing to remove or nothing left', () => {
    expect(cutOut(image(50, 50, white, () => null))).toBeNull();
    expect(cutOut(image(50, 50, white, (x, y) => (x === 25 && y === 25 ? red : null)))).toBeNull();
  });

  it('handles a product screenshot: dark bars, white page, stray text', () => {
    const black = [10, 10, 10];
    const src = image(120, 100, black, (x, y) => {
      if (x < 20 || x >= 100) return null; // dark phone bars
      if (x >= 40 && x < 80 && y >= 25 && y < 70) return red; // the item
      if (x >= 30 && x < 50 && y >= 85 && y < 88) return black; // caption text on the page
      return white;
    });
    const out = cutOut(src)!;
    expect(out.width).toBeLessThan(50);
    expect(out.height).toBeLessThan(55);
    expect(alphaAt(out, 0, 0)).toBe(0);
    expect(alphaAt(out, out.width >> 1, out.height >> 1)).toBe(255);
  });

  it('drops a soft shadow under the item but keeps a grey item with a sharp edge', () => {
    const shadowed = image(100, 100, white, (x, y) => {
      if (x >= 30 && x < 70 && y >= 20 && y < 70) return red;
      if (x >= 25 && x < 75 && y >= 70 && y < 82) {
        const v = 250 - (82 - y) * 6; // darkest against the item, fading out
        return [v, v, v];
      }
      return null;
    });
    const out = cutOut(shadowed)!;
    expect(out.height).toBeLessThan(60); // item is 50 tall; the 12px shadow is not included

    const grey = image(100, 100, white, (x, y) => (x >= 30 && x < 70 && y >= 20 && y < 80 ? [150, 150, 150] : null));
    const cut = cutOut(grey)!;
    expect(alphaAt(cut, cut.width >> 1, cut.height >> 1)).toBe(255);
  });
});
