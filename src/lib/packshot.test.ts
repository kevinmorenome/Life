import { describe, expect, it } from 'vitest';
import { cutOutWhiteBackground } from './packshot';

type Px = [number, number, number];
const W = 60;
const H = 80;
/** An image painted pixel by pixel: `paint(x, y)` gives the colour. */
function image(paint: (x: number, y: number) => Px, w = W, h = H): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      d.set([r, g, b, 255], (y * w + x) * 4);
    }
  return d;
}
const alpha = (d: Uint8ClampedArray, x: number, y: number, w = W) => d[(y * w + x) * 4 + 3];
const WHITE: Px = [255, 255, 255];
const BLUE: Px = [40, 70, 170];
const OUTLINE: Px = [190, 190, 190];
const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

describe('cutOutWhiteBackground', () => {
  it('removes the background and keeps a coloured product with a white label on it', () => {
    const img = image((x, y) => (inRect(x, y, 15, 10, 44, 69) ? (inRect(x, y, 20, 30, 39, 50) ? WHITE : BLUE) : WHITE));
    const out = cutOutWhiteBackground(img, W, H)!;
    expect(alpha(out.data, 2, 2)).toBe(0);
    expect(alpha(out.data, 55, 75)).toBe(0);
    expect(alpha(out.data, 30, 20)).toBe(255); // the blue body
    expect(alpha(out.data, 30, 40)).toBe(255); // the white label, enclosed by the product, stays
    expect(out.box).toEqual({ x: 15, y: 10, w: 30, h: 60 });
    expect(out.removed).toBeCloseTo(1 - (30 * 60) / (W * H), 2);
  });

  it('keeps a white product that has an outline (white body, white cap), only the outside goes', () => {
    const body = (x: number, y: number) => inRect(x, y, 14, 25, 45, 70);
    const cap = (x: number, y: number) => inRect(x, y, 22, 8, 37, 25);
    const edge = (x: number, y: number) => (body(x, y) || cap(x, y)) && !(inRect(x, y, 15, 26, 44, 69) || inRect(x, y, 23, 9, 36, 25));
    const img = image((x, y) => (edge(x, y) ? OUTLINE : body(x, y) || cap(x, y) ? [252, 252, 252] : WHITE));
    const out = cutOutWhiteBackground(img, W, H)!;
    expect(alpha(out.data, 5, 5)).toBe(0);
    expect(alpha(out.data, 30, 45)).toBe(255); // inside the white body
    expect(alpha(out.data, 30, 15)).toBe(255); // inside the white cap
    expect(alpha(out.data, 14, 45)).toBeGreaterThan(0); // its outline
  });

  it('is not fooled by a 1 px gap in the outline: the white inside stays', () => {
    const body = (x: number, y: number) => inRect(x, y, 14, 25, 45, 70);
    const img = image((x, y) => {
      if (!body(x, y)) return WHITE;
      const outline = !inRect(x, y, 15, 26, 44, 69);
      if (outline && x === 14 && y === 45) return WHITE; // a gap in the left edge
      return outline ? OUTLINE : WHITE;
    });
    const out = cutOutWhiteBackground(img, W, H)!;
    expect(alpha(out.data, 30, 45)).toBe(255);
    expect(alpha(out.data, 16, 45)).toBe(255);
  });

  it('shrugs off a little JPEG noise in the background', () => {
    const img = image((x, y) => (inRect(x, y, 15, 10, 44, 69) ? BLUE : (x * 7 + y * 3) % 5 === 0 ? [251, 252, 250] : WHITE));
    const out = cutOutWhiteBackground(img, W, H)!;
    expect(alpha(out.data, 3, 3)).toBe(0);
    expect(alpha(out.data, 30, 30)).toBe(255);
  });

  it('takes the white out of the blended edge pixels and gives them the product colour back', () => {
    // a column of 50% blue / 50% white where the product meets the background (a fringe)
    const fringe: Px = [Math.round((40 + 255) / 2), Math.round((70 + 255) / 2), Math.round((170 + 255) / 2)];
    const img = image((x, y) => (inRect(x, y, 15, 10, 44, 69) ? (x === 15 ? fringe : BLUE) : WHITE));
    const out = cutOutWhiteBackground(img, W, H)!;
    const o = (40 * W + 15) * 4;
    expect(out.data[o + 3]).toBeGreaterThan(90);
    expect(out.data[o + 3]).toBeLessThan(165); // about half transparent
    expect(Array.from(out.data.slice(o, o + 3))).toEqual([40, 70, 170]); // the colour is the product's, not pale
    expect(alpha(out.data, 17, 40)).toBe(255); // inside is untouched
  });

  it('removes a pale speck next to the edge but leaves a nearly white product\'s edge alone', () => {
    const speck = image((x, y) => (inRect(x, y, 15, 10, 44, 69) ? BLUE : x === 13 && y === 40 ? [235, 235, 245] : WHITE));
    expect(cutOutWhiteBackground(speck, W, H)!.data[(40 * W + 13) * 4 + 3]).toBeLessThan(40); // nearly invisible
    const pale = image((x, y) => (inRect(x, y, 15, 10, 44, 69) ? (inRect(x, y, 16, 11, 43, 68) ? [244, 244, 244] : [200, 200, 200]) : WHITE));
    const out = cutOutWhiteBackground(pale, W, H)!;
    expect(alpha(out.data, 30, 40)).toBe(255);
    expect(alpha(out.data, 15, 40)).toBeGreaterThan(0);
  });

  it('drops stray specks beside the product but keeps a real separate part', () => {
    const img = image((x, y) => {
      if (inRect(x, y, 15, 10, 44, 69)) return BLUE;
      if (inRect(x, y, 5, 5, 6, 6)) return [200, 200, 215]; // a 2x2 speck
      if (inRect(x, y, 50, 30, 57, 37)) return BLUE; // an 8x8 part that is its own piece
      return WHITE;
    });
    const out = cutOutWhiteBackground(img, W, H)!;
    expect(alpha(out.data, 5, 5)).toBe(0);
    expect(alpha(out.data, 6, 6)).toBe(0);
    expect(alpha(out.data, 53, 33)).toBe(255);
    expect(alpha(out.data, 30, 30)).toBe(255);
  });

  it('leaves the picture alone when it is not on a white background', () => {
    expect(cutOutWhiteBackground(image(() => [30, 90, 60]), W, H)).toBeNull();
    expect(cutOutWhiteBackground(image((x, y) => (inRect(x, y, 15, 10, 44, 69) ? BLUE : [200, 220, 240])), W, H)).toBeNull();
  });

  it('leaves the picture alone when the product is as white as the background and has no outline', () => {
    expect(cutOutWhiteBackground(image(() => WHITE), W, H)).toBeNull();
    expect(cutOutWhiteBackground(image((x, y) => (inRect(x, y, 10, 10, 50, 70) ? [252, 252, 252] : WHITE)), W, H)).toBeNull();
  });

  it('leaves the picture alone when almost nothing would be removed or almost nothing would be left', () => {
    expect(cutOutWhiteBackground(image((x, y) => (inRect(x, y, 1, 1, 58, 78) ? BLUE : WHITE)), W, H)).toBeNull();
    expect(cutOutWhiteBackground(image((x, y) => (inRect(x, y, 28, 38, 31, 41) ? BLUE : WHITE)), W, H)).toBeNull();
  });

  it('refuses tiny or inconsistent input', () => {
    expect(cutOutWhiteBackground(new Uint8ClampedArray(16), 2, 2)).toBeNull();
    expect(cutOutWhiteBackground(new Uint8ClampedArray(10), W, H)).toBeNull();
  });
});
