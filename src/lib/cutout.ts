/** Minimal pixel buffer, structurally compatible with the browser's `ImageData`. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface CutoutOptions {
  /** Max RGB distance from the backdrop colour that still counts as backdrop. */
  tolerance?: number;
  /** Transparent margin kept around the item, as a fraction of its larger side. */
  padding?: number;
}

const dist = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) =>
  Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b);

const median = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1];

/**
 * Removes a plain backdrop and crops to the item. The backdrop colour is the median of the
 * border; background is whatever connects to the border within `tolerance` of it, so same-coloured
 * areas inside the garment survive. Returns a new buffer, or `null` when the photo doesn't have a
 * plain enough backdrop (caller keeps the original). Never mutates the input.
 */
export function cutOut(src: Pixels, opts: CutoutOptions = {}): Pixels | null {
  const { tolerance = 42, padding = 0.04 } = opts;
  const { width: w, height: h } = src;
  if (w < 8 || h < 8) return null;
  const d = src.data;

  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);

  const bg = [0, 1, 2].map((c) => median(border.map((p) => d[p * 4 + c])));
  const matches = (p: number) => dist(d, p * 4, bg[0], bg[1], bg[2]) <= tolerance;
  // A busy border (patterned floor, hand in frame) means the colour guess would be unreliable.
  if (border.filter(matches).length / border.length < 0.7) return null;

  const isBg = new Uint8Array(w * h);
  const stack: number[] = border.filter(matches);
  for (const p of stack) isBg[p] = 1;
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q < 0 || q >= w * h || isBg[q] || !matches(q)) continue;
      isBg[q] = 1;
      stack.push(q);
    }
  }

  // Soft edge: average the mask over 3×3 so the cut doesn't look jagged.
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          sum += isBg[yy * w + xx] ? 0 : 255;
          n++;
        }
      }
      alpha[y * w + x] = isBg[y * w + x] ? Math.min(sum / n, 128) : Math.max(sum / n, 128);
    }
  }

  let minX = w, minY = h, maxX = -1, maxY = -1, kept = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] < 128 || isBg[y * w + x]) continue;
      kept++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const share = kept / (w * h);
  // Nothing removed, or nothing left: the cut failed, don't hand back a blank image.
  if (share > 0.97 || share < 0.02) return null;

  const pad = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * padding);
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(w - 1, maxX + pad);
  const y1 = Math.min(h - 1, maxY + pad);
  const ow = x1 - x0 + 1;
  const oh = y1 - y0 + 1;
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const p = (y0 + y) * w + (x0 + x);
      const o = (y * ow + x) * 4;
      out[o] = d[p * 4];
      out[o + 1] = d[p * 4 + 1];
      out[o + 2] = d[p * 4 + 2];
      out[o + 3] = isBg[p] && alpha[p] < 128 ? 0 : alpha[p];
    }
  }
  return { data: out, width: ow, height: oh };
}
