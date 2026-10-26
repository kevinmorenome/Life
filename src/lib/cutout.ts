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

/**
 * Removes a plain backdrop and crops to the item. The backdrop is the dominant border colours;
 * background is whatever connects to the border within `tolerance` of them, so same-coloured
 * areas inside the garment survive, and only the largest blob is kept (page text, specks go). Returns a new buffer, or `null` when the photo doesn't have a
 * plain enough backdrop (caller keeps the original). Never mutates the input.
 */
export function cutOut(src: Pixels, opts: CutoutOptions = {}): Pixels | null {
  // Already a cutout: cutting again would only chew into the item.
  if (opaqueArea(src) < 0.98 * (src.width * src.height)) return null;
  const first = cutOnce(src, { ...opts, padding: 0 }, false);
  if (!first) return null;
  // Screenshots and product pages: the photo's own backdrop (white) sits inside dark bars, so it
  // only becomes the border after the first crop. Keep the second cut only if the item survives it.
  const second = cutOnce(first, opts, true);
  return second && opaqueArea(second) >= 0.25 * opaqueArea(first) ? second : cutOnce(src, opts, false);
}

const opaqueArea = (p: Pixels) => {
  let n = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] >= 128) n++;
  return n;
};

/** `lightOnly`: second pass, where a tight crop puts the item itself on the border; trust only near-white. */
function cutOnce(src: Pixels, opts: CutoutOptions, lightOnly: boolean): Pixels | null {
  const { tolerance = 42, padding = 0.04 } = opts;
  const { width: w, height: h } = src;
  if (w < 8 || h < 8) return null;
  const d = src.data;

  // Second pass samples a ring just inside the edge: after a crop the outermost pixels are blurred.
  const inset = lightOnly ? Math.max(2, Math.round(Math.min(w, h) * 0.02)) : 0;
  const border: number[] = [];
  for (let x = inset; x < w - inset; x++) border.push(inset * w + x, (h - 1 - inset) * w + x);
  for (let y = inset + 1; y < h - 1 - inset; y++) border.push(y * w + inset, y * w + w - 1 - inset);

  // Backdrop palette: the dominant border colours (a screenshot has dark bars beside a white page).
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const p of border) {
    if (d[p * 4 + 3] < 128) continue;
    const key = ((d[p * 4] >> 5) << 6) | ((d[p * 4 + 1] >> 5) << 3) | (d[p * 4 + 2] >> 5);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += d[p * 4];
    e.g += d[p * 4 + 1];
    e.b += d[p * 4 + 2];
    buckets.set(key, e);
  }
  const palette = [...buckets.values()]
    .filter((e) => e.n / border.length >= 0.06)
    .sort((x, y) => y.n - x.n)
    .slice(0, 4)
    .map((e) => [e.r / e.n, e.g / e.n, e.b / e.n])
    .filter(([r, g, b]) => !lightOnly || Math.min(r, g, b) >= 190);
  const matches = (p: number) =>
    d[p * 4 + 3] < 128 || palette.some(([r, g, b]) => dist(d, p * 4, r, g, b) <= tolerance);
  // A busy border (patterned floor, hand in frame) means the backdrop guess would be unreliable.
  if (border.filter(matches).length / border.length < (lightOnly ? 0.5 : 0.7)) return null;

  // Soft shadows: a darker, same-hue version of a backdrop colour that fades in smoothly. Only
  // reachable from backdrop, and a garment's own edge is too abrupt to qualify.
  const shadowLike = (p: number) =>
    palette.some(([r, g, b]) => {
      // Studio-style light backdrops only: a dark "backdrop" colour is more likely the item itself.
      if (Math.min(r, g, b) < 150) return false;
      const len2 = r * r + g * g + b * b;
      const k = (d[p * 4] * r + d[p * 4 + 1] * g + d[p * 4 + 2] * b) / len2;
      return k >= 0.55 && k <= 1 && dist(d, p * 4, r * k, g * k, b * k) <= 14;
    });
  const smooth = (p: number, q: number) =>
    Math.max(
      Math.abs(d[p * 4] - d[q * 4]),
      Math.abs(d[p * 4 + 1] - d[q * 4 + 1]),
      Math.abs(d[p * 4 + 2] - d[q * 4 + 2]),
    ) <= 7;

  const isBg = new Uint8Array(w * h);
  const stack: number[] = border.filter(matches);
  for (const p of stack) isBg[p] = 1;
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q < 0 || q >= w * h || isBg[q]) continue;
      if (!matches(q) && !(smooth(p, q) && shadowLike(q))) continue;
      isBg[q] = 1;
      stack.push(q);
    }
  }

  // Keep only the largest remaining blob (the item); page text, UI bits and specks become backdrop.
  const label = new Int32Array(w * h);
  let best = 0;
  let bestSize = 0;
  for (let start = 0; start < w * h; start++) {
    if (isBg[start] || label[start]) continue;
    const id = start + 1;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || isBg[q] || label[q]) continue;
        label[q] = id;
        stack.push(q);
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
  }
  for (let p = 0; p < w * h; p++) if (label[p] !== best) isBg[p] = 1;

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
