// Finds product pictures in Konzum's web shop (https://www.konzum.hr), the shop most of the groceries come from.
// Konzum has no API, so this reads what it publishes for search engines: the product sitemap and the product pages'
// structured data (JSON-LD). Its robots.txt allows both and asks robots to stay away from /api and the cart, which
// this never touches. Everything it returns is untrusted data from a third party; it is only used to show and
// download a picture, and the pictures belong to Konzum and the brands (private use in this app only).
import { normalizeKey } from '../src/modules/food/products';
import type { PhotoCandidate, PhotoSearchResult } from './openfoodfacts';

const SITEMAP = 'https://www.konzum.hr/sitemap_products.xml';
const PRODUCT = /^https:\/\/www\.konzum\.hr\/web\/products\/[a-z0-9-]+$/;
/** Where Konzum's product pictures are served from (read off its product pages); the Worker fetches nothing else for it. */
export const KONZUM_IMAGE_HOST = /^https:\/\/d17zv3ray5yxvp\.cloudfront\.net\//;
const AGENT = 'LifeApp/1.0 (personal grocery tracker; https://github.com/kevinmorenome/Life)';
const MAX_PAGES = 6;
const SITEMAP_TTL = 6 * 3600_000;

export interface CatalogueEntry {
  url: string;
  slug: string;
}

/** The product pages in Konzum's sitemap. */
export function parseSitemap(xml: string): CatalogueEntry[] {
  const out: CatalogueEntry[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = m[1];
    if (PRODUCT.test(url)) out.push({ url, slug: url.slice(url.lastIndexOf('/') + 1) });
  }
  return out;
}

/** Filler on receipts and packs that says nothing about the product. */
const FILLER = new Set(['plu', 'kom', 'pak', 'kg', 'gr', 'ml', 'pack', 'pakiranje']);
/** Words of a text worth matching on: no accents, lowercase, not too short, not just a number or filler. */
const words = (text: string): string[] => [...new Set(normalizeKey(text).split(' ').filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !/^\d+(ml|g|kg|gr|l|cl|kom)$/.test(w) && !FILLER.has(w)))];
/** The same word give or take its ending: "krastavac" / "krastavci", "prsa" / "prsni", "mrkva" / "mrkvica". */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 3 && i >= 0.6 * Math.min(a.length, b.length);
}

/**
 * The catalogue entries whose name shares most of the words of any of the given texts (the receipt's printed text
 * is in Croatian like the shop, the product's own name is often English), best first. An entry needs at least half
 * of a text's words; of equally good ones the shorter name is more likely the plain product.
 */
export function rankCatalogue<T extends { slug: string }>(catalogue: T[], texts: string[], limit = MAX_PAGES): T[] {
  const queries = texts.map(words).filter((w) => w.length > 0);
  if (queries.length === 0) return [];
  const scored: { e: T; score: number }[] = [];
  for (const e of catalogue) {
    const slugWords = e.slug.split('-').filter(Boolean);
    let best = 0;
    for (const q of queries) {
      const matched = q.filter((w) => slugWords.some((s) => sameWord(w, s))).length;
      if (matched > 0 && matched / q.length >= 0.5) best = Math.max(best, matched / q.length + matched * 0.01);
    }
    if (best > 0) scored.push({ e, score: best });
  }
  return scored.sort((a, b) => b.score - a.score || a.e.slug.length - b.e.slug.length || a.e.slug.localeCompare(b.e.slug)).slice(0, limit).map((s) => s.e);
}

export interface ShopProduct {
  name: string;
  brand?: string;
  code?: string;
  imageUrl: string;
}

/** Konzum writes HTML codes into its names ("mango&amp;lime"). */
const decode = (t: string): string => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const str = (v: unknown, max = 160): string | undefined => (typeof v === 'string' && v.trim() ? decode(v).replace(/\s+/g, ' ').trim().slice(0, max) : undefined);

function firstImage(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return firstImage(v[0]);
  if (typeof v === 'object' && v !== null) return str((v as { url?: unknown }).url, 500);
  return undefined;
}

const meta = (html: string, property: string): string | undefined => {
  const m = html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`));
  return m ? str(m[1]) : undefined;
};

/**
 * The product described by a product page (name, brand, barcode and picture), if it has a usable picture: from its
 * JSON-LD, else from its title and picture meta tags (a product that is gone from the shop still has its page).
 */
export function parseProductPage(html: string): ShopProduct | undefined {
  const shopImages = new Set<string>();
  for (const block of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data: unknown;
    try {
      data = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const nodes: unknown[] = Array.isArray(data) ? data : typeof data === 'object' && data !== null && Array.isArray((data as { '@graph'?: unknown })['@graph']) ? (data as { '@graph': unknown[] })['@graph'] : [data];
    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) continue;
      const n = node as Record<string, unknown>;
      if (n['@type'] !== 'Product') {
        // The shop's own logo and picture are not the product's.
        const own = firstImage(n.image) ?? firstImage(n.logo);
        if (own) shopImages.add(own);
        continue;
      }
      const imageUrl = firstImage(n.image);
      const name = str(n.name);
      if (!imageUrl || !name || !KONZUM_IMAGE_HOST.test(imageUrl)) continue;
      const brand = typeof n.brand === 'object' && n.brand !== null ? str((n.brand as { name?: unknown }).name, 60) : str(n.brand, 60);
      // Konzum's own `sku` is its internal code, not a barcode: it only serves to tell products apart.
      const code = str(n.gtin13, 20) ?? str(n.gtin, 20) ?? str(n.gtin8, 20) ?? str(n.sku, 20);
      return { name, brand, code, imageUrl };
    }
  }
  const imageUrl = meta(html, 'og:image');
  const title = meta(html, 'og:title')?.replace(/\s*[-|–]\s*Konzum\s*$/i, '').trim();
  if (imageUrl && title && KONZUM_IMAGE_HOST.test(imageUrl) && !shopImages.has(imageUrl)) return { name: title, imageUrl };
  return undefined;
}

let catalogueCache: { at: number; entries: CatalogueEntry[] } | undefined;
const pageCache = new Map<string, ShopProduct | null>();
/** Forget what was fetched (tests). */
export function resetKonzumCache(): void {
  catalogueCache = undefined;
  pageCache.clear();
}

async function getText(url: string, doFetch: typeof fetch, allowGone = false): Promise<string> {
  const res = await doFetch(url, { headers: { 'User-Agent': AGENT, Accept: 'text/html,application/xml' }, signal: AbortSignal.timeout(9000) });
  // A product that is gone from the shop answers 404 but its page still names it and shows its picture.
  if (!res.ok && !(allowGone && res.status === 404)) throw new Error(`Konzum answered ${res.status}`);
  return res.text();
}

async function catalogue(doFetch: typeof fetch, now: number): Promise<CatalogueEntry[]> {
  if (catalogueCache && now - catalogueCache.at < SITEMAP_TTL) return catalogueCache.entries;
  const entries = parseSitemap(await getText(SITEMAP, doFetch));
  if (entries.length === 0) throw new Error("Konzum's product list was empty");
  catalogueCache = { at: now, entries };
  return entries;
}

/** Konzum products that look like one of the given texts (name words, printed receipt text), with their pictures. */
export async function searchKonzum(texts: string[], doFetch: typeof fetch = fetch, now = Date.now()): Promise<PhotoSearchResult> {
  try {
    const hits = rankCatalogue(await catalogue(doFetch, now), texts);
    const products = await Promise.all(
      hits.map(async (e) => {
        if (pageCache.has(e.url)) return pageCache.get(e.url) ?? undefined;
        try {
          const p = parseProductPage(await getText(e.url, doFetch, true)) ?? null;
          pageCache.set(e.url, p);
          return p ?? undefined;
        } catch {
          return undefined;
        }
      }),
    );
    const candidates = products.flatMap((p, i): PhotoCandidate[] =>
      p ? [{ code: p.code ?? hits[i].slug, name: p.name, brand: p.brand, country: 'croatia', imageUrl: p.imageUrl, source: 'Konzum', pageUrl: hits[i].url }] : [],
    );
    return { candidates };
  } catch (e) {
    return { candidates: [], error: e instanceof Error ? e.message : 'Could not reach Konzum.' };
  }
}
