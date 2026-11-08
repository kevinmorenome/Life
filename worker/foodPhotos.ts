// The picture search behind "Find a picture" and Claude's find_product_photo: Konzum's and dm's web shops (exact products,
// found with the Croatian text printed on the receipt) and Open Food Facts (packaged goods by name or barcode), side by side.
import { DM_IMAGE_HOST, searchDm } from './dm';
import { KONZUM_IMAGE_HOST, searchKonzum } from './konzum';
import { OFF_IMAGE_HOST, searchPhotos, type PhotoCandidate, type PhotoSearchResult } from './openfoodfacts';

const MAX_PER_SOURCE = 6;
const MAX_IMAGE_BYTES = 2_500_000;
const AGENT = 'LifeApp/1.0 (personal grocery tracker; https://github.com/kevinmorenome/Life)';

export interface PhotoSearchInput {
  /** The product's name as shown in the app. */
  query?: string;
  /** The text printed on the receipt for it, usually in Croatian: the best way into Konzum's catalogue. */
  rawName?: string;
  /** A barcode: exact, looked up at Open Food Facts only. */
  code?: string;
  /** Where the product was bought, so that shop's own catalogue comes first ("dm", "Konzum"). */
  store?: string;
}

/** The shop's own matches first (Konzum unless the product came from dm), then the other shop's, then Open Food Facts', without the same picture twice. */
export async function searchAllPhotos(input: PhotoSearchInput, doFetch: typeof fetch = fetch): Promise<PhotoSearchResult> {
  if (input.code?.trim()) return searchPhotos({ code: input.code }, doFetch);
  const texts = [input.rawName, input.query].filter((t): t is string => !!t?.trim());
  if (texts.length === 0) return { candidates: [], error: 'Give a barcode or some words from the product name.' };
  const [konzum, dm, open] = await Promise.all([searchKonzum(texts, doFetch), searchDm(texts, doFetch), searchPhotos({ query: input.query?.trim() || input.rawName }, doFetch)]);
  const fromDm = /^\s*dm\b/i.test(input.store ?? '');
  const shops = fromDm ? [dm, konzum] : [konzum, dm];
  const seen = new Set<string>();
  const candidates: PhotoCandidate[] = [];
  for (const c of [...shops.flatMap((s) => s.candidates.slice(0, MAX_PER_SOURCE)), ...open.candidates.slice(0, MAX_PER_SOURCE)]) {
    if (seen.has(c.imageUrl)) continue;
    seen.add(c.imageUrl);
    candidates.push(c);
  }
  return { candidates, ...(candidates.length === 0 ? { error: konzum.error ?? dm.error ?? open.error } : {}) };
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });

/** GET /api/food/photos?q=<name>&raw=<receipt text>|code=<barcode> */
export async function handleFoodPhotos(url: URL, doFetch: typeof fetch = fetch): Promise<Response> {
  const p = url.searchParams;
  const result = await searchAllPhotos({ query: p.get('q') ?? undefined, rawName: p.get('raw') ?? undefined, code: p.get('code') ?? undefined, store: p.get('store') ?? undefined }, doFetch);
  return json(result, 200, { 'Cache-Control': 'private, max-age=300' });
}

/** Pictures the Worker will fetch for the app: only from the hosts the searches above return. */
export const allowedImage = (u: string): boolean => u.length <= 600 && (OFF_IMAGE_HOST.test(u) || KONZUM_IMAGE_HOST.test(u) || DM_IMAGE_HOST.test(u));

/**
 * GET /api/food/photo-image?url=<picture url>: the picture's bytes, so the app can turn it into a tile picture
 * without depending on the image host allowing browsers to read it.
 */
export async function handleFoodPhotoImage(url: URL, doFetch: typeof fetch = fetch): Promise<Response> {
  const target = url.searchParams.get('url') ?? '';
  if (!allowedImage(target)) return json({ error: 'That picture is not from a supported source.' }, 400);
  try {
    const res = await doFetch(target, { headers: { 'User-Agent': AGENT, Accept: 'image/*' }, signal: AbortSignal.timeout(9000) });
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !type.startsWith('image/') || type.includes('svg')) return json({ error: 'Could not get that picture.' }, 502);
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: 'That picture is too big.' }, 502);
    return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' } });
  } catch {
    return json({ error: 'Could not get that picture.' }, 502);
  }
}
