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

function drawScaled(img: HTMLImageElement, maxSize: number) {
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
 * then drops stray bits and crops to the item. Resolves to a transparent PNG data URL, or `null`
 * when the photo is already a cut-out or nothing was found.
 */
export async function cutOutImage(file: Blob, maxSize = 800): Promise<string | null> {
  // The model works at 1024px; feeding it more only costs memory on phones.
  const input = drawScaled(await loadImage(file), 1024);
  if (hasTransparency(input.ctx.getImageData(0, 0, input.canvas.width, input.canvas.height))) return null;
  const blob = await new Promise<Blob>((resolve, reject) =>
    input.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/png'),
  );

  const { removeBackground } = await import('@imgly/background-removal');
  const cut = await removeBackground(blob, { model: 'small', output: { format: 'image/png' } });

  const { canvas, ctx } = drawScaled(await loadImage(cut), maxSize);
  const out = tidyCutout(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (!out) return null;
  canvas.width = out.width;
  canvas.height = out.height;
  ctx.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
  return canvas.toDataURL('image/png');
}
