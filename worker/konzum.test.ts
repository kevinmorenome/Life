import { beforeEach, describe, expect, it } from 'vitest';
import { parseProductPage, parseSitemap, rankCatalogue, resetKonzumCache, sameWord, searchKonzum } from './konzum';

const IMG = 'https://d17zv3ray5yxvp.cloudfront.net/variants/abc/def';
const sitemap = (...slugs: string[]) => `<?xml version='1.0'?><urlset>${slugs.map((s) => `<url><loc>https://www.konzum.hr/web/products/${s}</loc><lastmod>2026-10-24</lastmod></url>`).join('')}</urlset>`;
const page = (over: Record<string, unknown> = {}, wrap: (d: unknown) => unknown = (d) => d) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(wrap({ '@context': 'https://schema.org', '@type': 'Product', name: 'Staropramen Svijetlo pivo 6x0,5 l', image: IMG, gtin13: '90770559', brand: { '@type': 'Brand', name: 'Staropramen' }, ...over }))}</script></head></html>`;

describe('parseSitemap', () => {
  it('keeps product pages only', () => {
    const xml = sitemap('staropramen-pivo-6pack-0-5l-lim', 'mrkva-1-kg') + '<loc>https://www.konzum.hr/web/categories/pivo</loc><loc>https://evil.example/web/products/x</loc>';
    expect(parseSitemap(xml).map((e) => e.slug)).toEqual(['staropramen-pivo-6pack-0-5l-lim', 'mrkva-1-kg']);
  });
});

describe('rankCatalogue', () => {
  const cat = parseSitemap(sitemap('staropramen-pivo-6pack-0-5l-lim', 'staropramen-svijetlo-pivo-0-5-l', 'ozujsko-pivo-0-5-l', 'krastavac-svjezi-kg', 'kiseli-krastavci-720-ml', 'pileci-prsni-file-kg', 'mrkva-1-kg', 'lay-s-chips-slani-140-g'));
  it('matches the receipt text printed in Croatian, ignoring accents and endings', () => {
    expect(rankCatalogue(cat, ['PIVO STAROPRAMEN 6PA'])[0].slug).toBe('staropramen-pivo-6pack-0-5l-lim');
    expect(rankCatalogue(cat, ['KRASTAVAC']).map((e) => e.slug)).toEqual(['krastavac-svjezi-kg', 'kiseli-krastavci-720-ml']);
    expect(rankCatalogue(cat, ['MRKVA 1/1']).map((e) => e.slug)).toEqual(['mrkva-1-kg']);
  });
  it('needs at least half of the words, and prefers the shorter name when equal', () => {
    expect(rankCatalogue(cat, ['pivo ozujsko zlatna']).map((e) => e.slug)).toEqual(['ozujsko-pivo-0-5-l']);
    expect(rankCatalogue(cat, ['caviar']).length).toBe(0);
    expect(rankCatalogue(cat, ['staropramen']).map((e) => e.slug)).toEqual(['staropramen-pivo-6pack-0-5l-lim', 'staropramen-svijetlo-pivo-0-5-l']);
  });
  it('uses the best of several texts (printed text first, English name second)', () => {
    expect(rankCatalogue(cat, ['Chicken breast fillet', 'FILE OD PRSA K PLU']).map((e) => e.slug)).toEqual(['pileci-prsni-file-kg']);
    expect(rankCatalogue(cat, ['', '   ', '12'])).toEqual([]);
  });
});

describe('sameWord', () => {
  it('forgives endings but not unrelated words', () => {
    expect([['krastavac', 'krastavci'], ['prsa', 'prsni'], ['mrkva', 'mrkvica'], ['pivo', 'pivo']].map(([a, b]) => sameWord(a, b))).toEqual([true, true, true, true]);
    expect([['pivo', 'pileci'], ['sir', 'sol'], ['file', 'filet']].map(([a, b]) => sameWord(a, b))).toEqual([false, false, true]);
  });
});

describe('parseProductPage', () => {
  it('reads the page as Konzum really writes it: brand as plain text, its own sku', () => {
    expect(parseProductPage(page({ brand: 'ZAGREBAČKA PIVOVARA d.o.o.', gtin13: undefined, sku: '90770559' }))).toEqual({ name: 'Staropramen Svijetlo pivo 6x0,5 l', brand: 'ZAGREBAČKA PIVOVARA d.o.o.', code: '90770559', imageUrl: IMG });
  });
  it('reads the name, brand, barcode and picture', () => {
    expect(parseProductPage(page())).toEqual({ name: 'Staropramen Svijetlo pivo 6x0,5 l', brand: 'Staropramen', code: '90770559', imageUrl: IMG });
  });
  it('decodes the HTML codes in names', () => {
    expect(parseProductPage(page({ name: 'Somersby Cider mango&amp;lime 0,5 l', brand: 'Somersby &amp; Co' }))).toMatchObject({ name: 'Somersby Cider mango&lime 0,5 l', brand: 'Somersby & Co' });
  });
  it('copes with images as lists or objects, and Product inside a graph or list', () => {
    expect(parseProductPage(page({ image: [IMG, 'x'] }))?.imageUrl).toBe(IMG);
    expect(parseProductPage(page({ image: { url: IMG } }))?.imageUrl).toBe(IMG);
    expect(parseProductPage(page({}, (d) => ({ '@graph': [{ '@type': 'WebSite' }, d] })))?.name).toContain('Staropramen');
    expect(parseProductPage(page({}, (d) => [{ '@type': 'Organization' }, d]))?.name).toContain('Staropramen');
  });
  it('falls back on the title and picture meta tags, for a product that is gone from the shop', () => {
    const gone = `<title>K Plus Pileći file od prsa - Konzum</title><meta property="og:title" content="K Plus Pileći file od prsa - Konzum"><meta property="og:image" content="${IMG}2"><script type="application/ld+json">${JSON.stringify({ '@type': 'LocalBusiness', image: IMG, logo: IMG, name: 'KONZUM' })}</script>`;
    expect(parseProductPage(gone)).toEqual({ name: 'K Plus Pileći file od prsa', imageUrl: IMG + '2' });
  });
  it('does not take the shop\'s own logo for a product picture, or a picture from another host', () => {
    const logoOnly = `<meta property="og:title" content="Nešto - Konzum"><meta property="og:image" content="${IMG}"><script type="application/ld+json">${JSON.stringify({ '@type': 'LocalBusiness', image: IMG })}</script>`;
    expect(parseProductPage(logoOnly)).toBeUndefined();
    expect(parseProductPage('<meta property="og:title" content="X"><meta property="og:image" content="https://evil.example/a.jpg">')).toBeUndefined();
  });
  it('ignores pages without a usable picture, from another host, or without a name', () => {
    expect(parseProductPage(page({ image: undefined }))).toBeUndefined();
    expect(parseProductPage(page({ image: 'https://evil.example/x.jpg' }))).toBeUndefined();
    expect(parseProductPage(page({ name: '' }))).toBeUndefined();
    expect(parseProductPage('<script type="application/ld+json">{not json</script>')).toBeUndefined();
    expect(parseProductPage('<html></html>')).toBeUndefined();
  });
});

describe('searchKonzum', () => {
  beforeEach(resetKonzumCache);
  const shop = (pages: Record<string, string>, calls: string[] = []) =>
    (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      expect((init?.headers as Record<string, string>)['User-Agent']).toMatch(/LifeApp/);
      if (String(url).endsWith('sitemap_products.xml')) return new Response(sitemap(...Object.keys(pages)));
      const slug = String(url).slice(String(url).lastIndexOf('/') + 1);
      return pages[slug] ? new Response(pages[slug]) : new Response('no', { status: 404 });
    }) as unknown as typeof fetch;

  it('finds the product pages that match and returns their pictures as candidates', async () => {
    const calls: string[] = [];
    const r = await searchKonzum(['Staropramen beer 6-pack', 'PIVO STAROPRAMEN 6PA'], shop({ 'staropramen-pivo-6pack-0-5l-lim': page(), 'mrkva-1-kg': page({ name: 'Mrkva' }) }, calls));
    expect(r.candidates).toEqual([{ code: '90770559', name: 'Staropramen Svijetlo pivo 6x0,5 l', brand: 'Staropramen', country: 'croatia', imageUrl: IMG, source: 'Konzum', pageUrl: 'https://www.konzum.hr/web/products/staropramen-pivo-6pack-0-5l-lim' }]);
    expect(calls).toHaveLength(2);
  });
  it('remembers the product list and the pages it read', async () => {
    const calls: string[] = [];
    const f = shop({ 'staropramen-pivo-6pack-0-5l-lim': page() }, calls);
    await searchKonzum(['staropramen'], f);
    await searchKonzum(['staropramen'], f);
    expect(calls).toHaveLength(2);
  });
  it('uses the page of a product that is gone (404) when it still shows a picture', async () => {
    const gone = `<meta property="og:title" content="K Plus Pileći file od prsa - Konzum"><meta property="og:image" content="${IMG}">`;
    const f = (async (url: string) => (String(url).endsWith('sitemap_products.xml') ? new Response(sitemap('k-plus-pileci-file-od-prsa')) : new Response(gone, { status: 404 }))) as unknown as typeof fetch;
    const r = await searchKonzum(['FILE OD PRSA K PLU'], f);
    expect(r.candidates.map((c) => c.name)).toEqual(['K Plus Pileći file od prsa']);
  });
  it('skips pages that fail, and says when the shop cannot be reached', async () => {
    const f = shop({ 'staropramen-pivo-6pack-0-5l-lim': 'not a product page' });
    expect((await searchKonzum(['staropramen'], f)).candidates).toEqual([]);
    resetKonzumCache();
    const down = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
    expect((await searchKonzum(['staropramen'], down)).error).toMatch(/503/);
  });
});
