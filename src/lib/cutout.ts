/** Minimal pixel buffer, structurally compatible with the browser's `ImageData`. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** True when part of the image is already transparent (an earlier cut-out). */
export function hasTransparency(src: Pixels, share = 0.02): boolean {
  let n = 0;
  for (let i = 3; i < src.data.length; i += 4) if (src.data[i] < 128) n++;
  return n > share * src.width * src.height;
}

/**
 * Tidies a model's cut-out: drops stray blobs (page text, buttons from a screenshot) much smaller
 * than the main one, but keeps comparable ones (the second shoe of a pair), then crops to what's
 * left with a transparent margin. Returns a new buffer, or `null` when nothing was kept.
 */
export function tidyCutout(src: Pixels, padding = 0.04, minShare = 0.3): Pixels | null {
  const { width: w, height: h, data: d } = src;
  const solid = (p: number) => d[p * 4 + 3] >= 128;

  const label = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!solid(start) || label[start]) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || label[q] || !solid(q)) continue;
        label[q] = id;
        stack.push(q);
      }
    }
    sizes.push(size);
  }
  const largest = Math.max(...sizes);
  if (largest === 0) return null;
  const keep = sizes.map((s) => s >= largest * minShare);

  // A faint halo pixel belongs to the blob it touches; one touching nothing kept is noise.
  const kept = (p: number) => {
    if (label[p]) return keep[label[p]];
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q >= 0 && q < w * h && label[q] && keep[label[q]]) return true;
    }
    return false;
  };

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let p = 0; p < w * h; p++) {
    if (!label[p] || !keep[label[p]]) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const pad = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * padding);
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const ow = Math.min(w - 1, maxX + pad) - x0 + 1;
  const oh = Math.min(h - 1, maxY + pad) - y0 + 1;
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const p = (y0 + y) * w + (x0 + x);
      const o = (y * ow + x) * 4;
      if (!d[p * 4 + 3] || !kept(p)) continue;
      out[o] = d[p * 4];
      out[o + 1] = d[p * 4 + 1];
      out[o + 2] = d[p * 4 + 2];
      out[o + 3] = d[p * 4 + 3];
    }
  }
  return { data: out, width: ow, height: oh };
}
