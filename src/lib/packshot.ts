// Cutting the white background out of a shop packshot (a product on a flat white background), without taking the
// product's own white with it. A general "subject" model guesses what to keep and loses white labels, caps and packs;
// here only the white that is connected to the picture's edge goes, so white enclosed by the product stays.
// Pure pixel logic (RGBA arrays), so it can be tested without a browser.

/** A pixel counts as background white when every colour channel is at least this (shop backgrounds are pure 255 with a little JPEG noise). */
const WHITE = 250;
/** Less than this share of the picture being background means it was not a packshot on white: leave it alone. */
const MIN_BACKGROUND = 0.08;
/** More than this means the product is about as white as the background and has no outline: cutting would erase it. */
const MAX_BACKGROUND = 0.9;
/** Less product than this (share of the picture) is not worth keeping. */
const MIN_PRODUCT = 0.03;
/** How many pixels in from the edge get their white part taken out. */
const EDGE_DEPTH = 3;
/** At least this share of the picture's border must be white for it to count as a packshot on white. */
const MIN_WHITE_BORDER = 0.6;

export interface Cutout {
  /** RGBA, same size as the input: background transparent, a clean soft edge, the rest opaque. */
  data: Uint8ClampedArray;
  /** Share of the picture that was background. */
  removed: number;
  /** Bounding box of what is left: x, y, width, height. */
  box: { x: number; y: number; w: number; h: number };
}

function erode(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let keep = 1;
      for (let dy = -1; dy <= 1 && keep; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          // Outside the picture counts as background, so the edge itself is not eaten.
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && !mask[ny * w + nx]) {
            keep = 0;
            break;
          }
        }
      }
      out[y * w + x] = keep;
    }
  }
  return out;
}

function dilateWithin(region: Uint8Array, within: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(region.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!within[i]) continue;
      let hit = region[i];
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && region[ny * w + nx]) {
            hit = 1;
            break;
          }
        }
      }
      out[i] = hit;
    }
  }
  return out;
}

/**
 * Makes the white background transparent, or returns `null` when the picture should be kept as it is: not on a white
 * background, or a product so white and outline-less that the cut would take it away.
 *
 * Leaks through a 1 to 2 px gap in an outline into a white label are stopped by looking for the background on a mask
 * shrunk by one pixel and growing the result back afterwards.
 */
/** Makes the connected groups of visible pixels smaller than a speck transparent. */
function dropSpecks(rgba: Uint8ClampedArray, w: number, h: number): void {
  const n = w * h;
  const minArea = Math.max(6, Math.round(n * 0.0004));
  const label = new Int32Array(n);
  let next = 0;
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (label[start] || rgba[start * 4 + 3] === 0) continue;
    next++;
    const members: number[] = [];
    label[start] = next;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      members.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!label[j] && rgba[j * 4 + 3] !== 0) {
            label[j] = next;
            stack.push(j);
          }
        }
      }
    }
    if (members.length < minArea) for (const i of members) rgba[i * 4 + 3] = 0;
  }
}

export function cutOutWhiteBackground(rgba: Uint8ClampedArray, w: number, h: number): Cutout | null {
  const n = w * h;
  if (w < 8 || h < 8 || rgba.length < n * 4) return null;
  const white = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    white[i] = rgba[o + 3] > 0 && rgba[o] >= WHITE && rgba[o + 1] >= WHITE && rgba[o + 2] >= WHITE ? 1 : 0;
  }

  let border = 0;
  let borderWhite = 0;
  for (let x = 0; x < w; x++) {
    border += 2;
    borderWhite += white[x] + white[(h - 1) * w + x];
  }
  for (let y = 1; y < h - 1; y++) {
    border += 2;
    borderWhite += white[y * w] + white[y * w + w - 1];
  }
  if (borderWhite / border < MIN_WHITE_BORDER) return null;

  // Background = white connected to the edge, found on the shrunk mask (4-connected flood fill).
  const core = erode(white, w, h);
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const push = (i: number) => {
    if (core[i] && !seen[i]) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const bg = dilateWithin(seen, white, w, h);

  let removed = 0;
  for (let i = 0; i < n; i++) removed += bg[i];
  const share = removed / n;
  if (share < MIN_BACKGROUND || share > MAX_BACKGROUND || 1 - share < MIN_PRODUCT) return null;

  // Output: background transparent, everything else as it was ...
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < n; i++) if (bg[i]) out[i * 4 + 3] = 0;

  // ... except the first few pixels in from the edge, which are a blend of product and white. For each, work out how
  // much of it is white (against the product colour just inside) and make that part transparent, with the product's
  // own colour underneath, so no white fringe shows on a dark tile.
  const dist = new Uint8Array(n).fill(255);
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) {
    if (bg[i]) continue;
    const x = i % w;
    if ((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < n - w && bg[i + w])) {
      dist[i] = 1;
      frontier.push(i);
    }
  }
  const ring: number[] = [...frontier];
  for (let d = 2; d <= EDGE_DEPTH; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1]) {
        if (j >= 0 && !bg[j] && dist[j] === 255) {
          dist[j] = d;
          next.push(j);
          ring.push(j);
        }
      }
    }
    frontier = next;
  }
  for (const i of ring) {
    const x = i % w;
    const y = (i - x) / w;
    // The product colour nearby: the pixels at least EDGE_DEPTH + 1 in from the edge, in a 9x9 window.
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let count = 0;
    for (let dy = -4; dy <= 4; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -4; dx <= 4; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const j = yy * w + xx;
        if (!bg[j] && dist[j] === 255) {
          sr += rgba[j * 4];
          sg += rgba[j * 4 + 1];
          sb += rgba[j * 4 + 2];
          count++;
        }
      }
    }
    if (count === 0) continue;
    const f = [sr / count, sg / count, sb / count];
    // Use the channel where product and white differ most; a product that is nearly white has nothing to separate.
    let k = 0;
    for (let c = 1; c < 3; c++) if (255 - f[c] > 255 - f[k]) k = c;
    const span = 255 - f[k];
    if (span < 30) continue;
    const o = i * 4;
    const a = Math.max(0, Math.min(1, (255 - rgba[o + k]) / span));
    if (a >= 0.92) continue;
    if (a < 0.06) {
      out[o + 3] = 0;
    } else {
      out[o] = f[0];
      out[o + 1] = f[1];
      out[o + 2] = f[2];
      out[o + 3] = Math.round(a * 255);
    }
  }

  // Stray specks (JPEG noise left floating beside the product) go; real separate parts are far bigger than that.
  dropSpecks(out, w, h);

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (out[(y * w + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { data: out, removed: share, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}
