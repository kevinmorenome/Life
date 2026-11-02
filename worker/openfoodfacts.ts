// Looks up pictures of packaged food in Open Food Facts (open data, https://world.openfoodfacts.org), for the
// product pictures in the food module. Run in the Worker because Open Food Facts asks apps to identify
// themselves with a User-Agent, which a browser can't set. Everything it returns is untrusted data.

const SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';
const PRODUCT = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'code,product_name,brands,quantity,image_front_url,countries_tags';
const AGENT = 'LifeApp/1.0 (personal grocery tracker; https://github.com/kevinmorenome/Life)';
/** Only pictures served from Open Food Facts itself are passed on. */
const IMAGE_HOST = /^https:\/\/(images|static)\.openfoodfacts\.(org|net)\//;
const MAX_CANDIDATES = 9;

export interface PhotoCandidate {
  /** Barcode. */
  code: string;
  name: string;
  brand?: string;
  quantity?: string;
  /** First country it is sold in, e.g. "croatia". */
  country?: string;
  /** Front picture (about 400 px wide). */
  imageUrl: string;
}

const text = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, max);
  return t || undefined;
};

function toCandidate(raw: unknown): PhotoCandidate | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const imageUrl = text(r.image_front_url, 500);
  const code = text(r.code, 20);
  if (!imageUrl || !code || !IMAGE_HOST.test(imageUrl)) return undefined;
  const countries = Array.isArray(r.countries_tags) ? r.countries_tags.filter((c): c is string => typeof c === 'string') : [];
  return {
    code,
    name: text(r.product_name) ?? text(r.brands) ?? code,
    brand: text(r.brands, 60),
    quantity: text(r.quantity, 30),
    country: countries[0]?.replace(/^[a-z]{2}:/, ''),
    imageUrl,
  };
}

/** The products in an Open Food Facts search or product response that have a front picture, most plausible first (Croatia, then the neighbours). */
export function parseCandidates(body: unknown): PhotoCandidate[] {
  if (typeof body !== 'object' || body === null) return [];
  const b = body as { products?: unknown; product?: unknown };
  const list = Array.isArray(b.products) ? b.products : b.product ? [b.product] : [];
  const near = ['croatia', 'slovenia', 'austria', 'germany', 'italy', 'hungary', 'serbia', 'bosnia-and-herzegovina'];
  const rank = (c: PhotoCandidate) => {
    const i = near.indexOf(c.country ?? '');
    return i === -1 ? near.length : i;
  };
  return list
    .map(toCandidate)
    .filter((c): c is PhotoCandidate => !!c)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c)
    .slice(0, MAX_CANDIDATES);
}

export interface PhotoSearchResult {
  candidates: PhotoCandidate[];
  /** Why there are none, when it is not just "nothing found". */
  error?: string;
}

async function get(url: string, doFetch: typeof fetch): Promise<unknown> {
  // Open Food Facts answers 503 when busy; one more try usually works.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await doFetch(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (res.ok) return res.json();
    if (res.status !== 503 && res.status !== 429) throw new Error(`Open Food Facts answered ${res.status}`);
    if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error('Open Food Facts is busy right now');
}

/** Pictures for a barcode (exact) or for words from the product name (loose). */
export async function searchPhotos(input: { query?: string; code?: string }, doFetch: typeof fetch = fetch): Promise<PhotoSearchResult> {
  const code = input.code?.replace(/\s+/g, '');
  const query = text(input.query, 100);
  try {
    if (code) {
      if (!/^\d{6,14}$/.test(code)) return { candidates: [], error: 'A barcode is 6 to 14 digits.' };
      return { candidates: parseCandidates(await get(`${PRODUCT}/${code}.json?fields=${FIELDS}`, doFetch)) };
    }
    if (!query) return { candidates: [], error: 'Give a barcode or some words from the product name.' };
    const params = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '24', fields: FIELDS });
    return { candidates: parseCandidates(await get(`${SEARCH}?${params}`, doFetch)) };
  } catch (e) {
    return { candidates: [], error: e instanceof Error ? e.message : 'Could not reach Open Food Facts.' };
  }
}

/** GET /api/food/photos?q=<words>|code=<barcode> */
export async function handleFoodPhotos(url: URL, doFetch: typeof fetch = fetch): Promise<Response> {
  const result = await searchPhotos({ query: url.searchParams.get('q') ?? undefined, code: url.searchParams.get('code') ?? undefined }, doFetch);
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' } });
}
