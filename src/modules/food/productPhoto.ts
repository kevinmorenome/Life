import { cutOutImage, resizeImage } from '../../lib/image';

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
 * A small picture of a product that already is a clean shop packshot (Konzum, Open Food Facts): just downscaled, on a
 * white background. No cut-out: it would take the product's own white (labels, caps, text, white packs) away with
 * the background.
 */
export async function packshotPhoto(file: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d')!;
    // Pictures with transparency would turn black as a JPEG: put them on white first.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return resizeImage(file, SIZE, 0.88);
  }
}

/** True for a picture kept as a flat JPEG on white (a shop packshot), false for a cut-out with a transparent background. */
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
