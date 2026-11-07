import { hasTransparency, tidyCutout } from './cutout';

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement | HTMLCanvasElement, maxSize: number) {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/** Downscales a photo to a JPEG data URL so it stays small in IndexedDB. */
export async function resizeImage(file: Blob, maxSize = 800, quality = 0.8): Promise<string> {
  return drawScaled(await loadImage(file), maxSize).canvas.toDataURL('image/jpeg', quality);
}

/**
 * Removes the background with an on-device segmentation model (`@imgly/background-removal`,
 * loaded on first use; its model files come from IMG.LY's CDN and are cached by the browser),
 * then drops stray bits and crops to the item. Resolves to a transparent WebP/PNG data URL, or `null`
 * when the photo is already a cut-out or nothing was found.
 */
export async function cutOutImage(file: Blob, maxSize = 800): Promise<string | null> {
  // Big enough that the item still has detail after cropping; capped to spare phone memory.
  const input = drawScaled(await loadImage(file), 2048);
  if (hasTransparency(input.ctx.getImageData(0, 0, input.canvas.width, input.canvas.height))) return null;
  const blob = await new Promise<Blob>((resolve, reject) =>
    input.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/png'),
  );

  const { removeBackground } = await import('@imgly/background-removal');
  const cut = await removeBackground(blob, { model: 'small', output: { format: 'image/png' } });

  // Crop at full resolution first, then downscale the item itself, not the whole photo.
  const full = drawScaled(await loadImage(cut), Infinity);
  const out = tidyCutout(full.ctx.getImageData(0, 0, full.canvas.width, full.canvas.height));
  if (!out) return null;
  full.canvas.width = out.width;
  full.canvas.height = out.height;
  full.ctx.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
  const small = drawScaled(full.canvas, maxSize).canvas;
  // WebP keeps transparency at a fraction of PNG's size; browsers that can't encode it give PNG.
  const webp = small.toDataURL('image/webp', 0.9);
  return webp.startsWith('data:image/webp') ? webp : small.toDataURL('image/png');
}

/**
 * A downscaled item photo with its background removed. Falls back to the plain
 * resize (`cutOut: false`) when that isn't possible: the model couldn't load
 * (needs a connection the first time), the photo is already transparent, or
 * nothing was found.
 */
export async function itemPhoto(file: Blob): Promise<{ photo: string; cutOut: boolean }> {
  try {
    const cut = await cutOutImage(file);
    if (cut) return { photo: cut, cutOut: true };
  } catch {
    // fall through to the plain resize
  }
  return { photo: await resizeImage(file), cutOut: false };
}
