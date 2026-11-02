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

export async function blobOf(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Downloads a picture (Open Food Facts's image host allows it) and makes a tile picture of it. */
export async function photoFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not download that picture.');
  return foodPhoto(await res.blob());
}
