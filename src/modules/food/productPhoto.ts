import { cutOutImage, resizeImage } from '../../lib/image';
import { cutOutWhiteBackground } from '../../lib/packshot';

/** Product pictures are small: tiles are about 110 px wide. */
const SIZE = 400;

/** A small picture of a product for a tile: background removed on-device when possible (like closet photos), else just downscaled. */
export async function foodPhoto(file: Blob): Promise<string> {
  try {
    const cut = await cutOutImage(file, SIZE);
    if (cut) return cut;
  } catch {
    // the model could not load (it needs a connection the first time): use the plain picture
  }
  return resizeImage(file, SIZE, 0.82);
}

/**
 * A small picture of a product that already is a clean shop packshot (Konzum, Open Food Facts). The white background
 * is cut out so the product floats like the others, but only the white connected to the picture's edge
 * (`cutOutWhiteBackground`): the product's own white (labels, caps, text, white packs) stays. When it is not a clean
 * packshot on white, or the product is so white it has no outline, the picture is kept whole instead: a flat JPEG on
 * white.
 */
export async function packshotPhoto(file: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    // Cut at (up to) 800 px so the outline is sharp, then scale the product down to tile size.
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const full = document.createElement('canvas');
    full.width = w;
    full.height = h;
    const ctx = full.getContext('2d', { willReadFrequently: true })!;
    // Pictures with transparency would turn black as a JPEG: put them on white first.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const cut = cutOutWhiteBackground(ctx.getImageData(0, 0, w, h).data, w, h);
    if (cut) {
      ctx.putImageData(new ImageData(cut.data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      const { x, y, w: bw, h: bh } = cut.box;
      const k = Math.min(1, SIZE / Math.max(bw, bh));
      const pad = Math.round(Math.max(bw, bh) * k * 0.03);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(bw * k)) + pad * 2;
      out.height = Math.max(1, Math.round(bh * k)) + pad * 2;
      out.getContext('2d')!.drawImage(full, x, y, bw, bh, pad, pad, Math.round(bw * k), Math.round(bh * k));
      // WebP keeps transparency small; a browser that cannot encode it gives PNG, which does too.
      return out.toDataURL('image/webp', 0.92);
    }
    // Not a packshot we can cut safely: keep it whole.
    const flat = document.createElement('canvas');
    const k = Math.min(1, SIZE / Math.max(w, h));
    flat.width = Math.max(1, Math.round(w * k));
    flat.height = Math.max(1, Math.round(h * k));
    flat.getContext('2d')!.drawImage(full, 0, 0, flat.width, flat.height);
    return flat.toDataURL('image/jpeg', 0.88);
  } catch {
    return resizeImage(file, SIZE, 0.88);
  }
}

/** True for a picture kept whole as a flat JPEG on white, false for a cut-out with a transparent background. */
export const isFlatPhoto = (photo: string | undefined): boolean => !!photo?.startsWith('data:image/jpeg');

export async function blobOf(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Downloads a shop picture through the Worker (which only fetches from the picture sources, and spares us the image hosts' browser rules) and makes a tile picture of it, keeping it as the packshot it is. */
export async function photoFromUrl(url: string): Promise<string> {
  const res = await fetch(`/api/food/photo-image?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error('Could not download that picture.');
  return packshotPhoto(await res.blob());
}
