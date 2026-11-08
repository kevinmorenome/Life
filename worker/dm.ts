// Finds product pictures in dm's web shop (https://www.dm.hr), where the shampoo, soap and the like come from.
// dm's product pages are empty shells that its site fills in from its own product service, so unlike Konzum there is
// no structured data in the page. This reads the product sitemap (which dm's robots.txt allows) to find the product
// and then the same product details dm's own pages show (name, brand, barcode, pictures); it never touches the cart,
// the shop's search or anything that needs a sign-in. Everything it returns is untrusted data from a third party; it is
// only used to show and download a picture, and the pictures belong to dm and the brands (private use in this app only).
import { rankCatalogue } from './konzum';
import type { PhotoCandidate, PhotoSearchResult } from './openfoodfacts';

const SITEMAP = 'https://www.dm.hr/product-sitemap.xml';
const DETAIL = 'https://products.dm.de/product/products/detail/hr/dan';
const PRODUCT = /^https:\/\/www\.dm\.hr\/p\/d\/(\d{3,9})\/([a-z0-9-]+)$/;
/** Where dm's product pictures are served from; the Worker fetches nothing else for it. */
export const DM_IMAGE_HOST = /^https:\/\/products\.dm-static\.com\/images\//;
const AGENT = 'LifeApp/1.0 (personal grocery tracker; https://github.com/kevinmorenome/Life)';
const SITEMAP_TTL = 6 * 3600_000;

export interface DmEntry {
  url: string;
  slug: string;
  /** dm's own product number. */
  dan: string;
}

/** The product pages in dm's sitemap. */
export function parseDmSitemap(xml: string): DmEntry[] {
  const out: DmEntry[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const p = PRODUCT.exec(m[1]);
    if (p) out.push({ url: m[1], dan: p[1], slug: p[2] });
  }
  return out;
}

export interface DmProduct {
  name: string;
  brand?: string;
  code?: string;
  imageUrl: string;
}

const str = (v: unknown, max = 160): string | undefined => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : undefined);

/** The product described by dm's product details, if it has a usable picture. */
export function parseDmDetail(body: unknown): DmProduct | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as { title?: { headline?: unknown }; brand?: { name?: unknown }; gtin?: unknown; images?: unknown };
  const headline = str(b.title?.headline);
  const brand = str(b.brand?.name, 60);
  const first = Array.isArray(b.images) ? (b.images[0] as { src?: unknown } | undefined) : undefined;
  const imageUrl = str(first?.src, 500);
  if (!headline || !imageUrl || !DM_IMAGE_HOST.test(imageUrl)) return undefined;
  const name = brand && !headline.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${headline}` : headline;
  const gtin = typeof b.gtin === 'number' ? String(b.gtin) : str(b.gtin, 20);
  return { name, brand, code: gtin && /^\d{8,14}$/.test(gtin) ? gtin : undefined, imageUrl };
}

let catalogueCache: { at: number; entries: DmEntry[] } | undefined;
const detailCache = new Map<string, DmProduct | null>();
/** Forget what was fetched (tests). */
export function resetDmCache(): void {
  catalogueCache = undefined;
  detailCache.clear();
}

async function get(url: string, doFetch: typeof fetch, accept: string): Promise<Response> {
  const res = await doFetch(url, { headers: { 'User-Agent': AGENT, Accept: accept }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`dm answered ${res.status}`);
  return res;
}

async function catalogue(doFetch: typeof fetch, now: number): Promise<DmEntry[]> {
  if (catalogueCache && now - catalogueCache.at < SITEMAP_TTL) return catalogueCache.entries;
  const entries = parseDmSitemap(await (await get(SITEMAP, doFetch, 'application/xml')).text());
  if (entries.length === 0) throw new Error("dm's product list was empty");
  catalogueCache = { at: now, entries };
  return entries;
}

/** dm products that look like one of the given texts (name words, printed receipt text), with their pictures. */
export async function searchDm(texts: string[], doFetch: typeof fetch = fetch, now = Date.now()): Promise<PhotoSearchResult> {
  try {
    const hits = rankCatalogue(await catalogue(doFetch, now), texts);
    const products = await Promise.all(
      hits.map(async (e) => {
        if (detailCache.has(e.dan)) return detailCache.get(e.dan) ?? undefined;
        try {
          const p = parseDmDetail(await (await get(`${DETAIL}/${e.dan}`, doFetch, 'application/json')).json()) ?? null;
          detailCache.set(e.dan, p);
          return p ?? undefined;
        } catch {
          return undefined;
        }
      }),
    );
    const candidates = products.flatMap((p, i): PhotoCandidate[] =>
      p ? [{ code: p.code ?? hits[i].dan, name: p.name, brand: p.brand, country: 'croatia', imageUrl: p.imageUrl, source: 'dm', pageUrl: hits[i].url }] : [],
    );
    return { candidates };
  } catch (e) {
    return { candidates: [], error: e instanceof Error ? e.message : 'Could not reach dm.' };
  }
}
