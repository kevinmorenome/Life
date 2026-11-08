import { beforeEach, describe, expect, it } from 'vitest';
import { DM_IMAGE_HOST, parseDmDetail, parseDmSitemap, resetDmCache, searchDm } from './dm';

const IMG = 'https://products.dm-static.com/images/f_auto,q_auto,c_fit,h_440,w_500/v1762470861/assets/pas/images/d19c0cb5/dmbio-tofu-natur';
const sitemap = (...entries: [string, string][]) =>
  `<?xml version="1.0"?><urlset>${entries.map(([dan, slug]) => `<url><loc>https://www.dm.hr/p/d/${dan}/${slug}</loc><lastmod>2026-10-06T12:10:30Z</lastmod></url>`).join('')}</urlset>`;
const detail = (over: Record<string, unknown> = {}) => ({ title: { headline: 'Tofu natur, 200 g' }, brand: { name: 'dmBio' }, gtin: 4067796251999, images: [{ src: IMG, thumbnailSrc: IMG }], ...over });

describe('parseDmSitemap', () => {
  it('keeps product pages only, with dm’s own number', () => {
    const xml = sitemap(['1457962', 'dmbio-tofu-natur'], ['2244975', 'asebon-sampon-protiv-masne-prhuti']) + '<loc>https://www.dm.hr/p/d/abc/x</loc><loc>https://evil.example/p/d/1234/x</loc><loc>https://www.dm.hr/store/zagreb</loc>';
    expect(parseDmSitemap(xml).map((e) => [e.dan, e.slug])).toEqual([['1457962', 'dmbio-tofu-natur'], ['2244975', 'asebon-sampon-protiv-masne-prhuti']]);
  });
});

describe('parseDmDetail', () => {
  it('reads the name with its brand, the barcode and the first picture', () => {
    expect(parseDmDetail(detail())).toEqual({ name: 'dmBio Tofu natur, 200 g', brand: 'dmBio', code: '4067796251999', imageUrl: IMG });
  });
  it('does not repeat a brand the name already starts with', () => {
    expect(parseDmDetail(detail({ title: { headline: 'HASK Curl Care šampon, 355 ml' }, brand: { name: 'HASK' } }))?.name).toBe('HASK Curl Care šampon, 355 ml');
  });
  it('needs a picture from dm’s own image host', () => {
    expect(parseDmDetail(detail({ images: [] }))).toBeUndefined();
    expect(parseDmDetail(detail({ images: [{ src: 'https://evil.example/x.jpg' }] }))).toBeUndefined();
    expect(parseDmDetail(null)).toBeUndefined();
    expect(DM_IMAGE_HOST.test(IMG)).toBe(true);
  });
  it('drops a barcode that is not a barcode', () => {
    expect(parseDmDetail(detail({ gtin: 'n/a' }))?.code).toBeUndefined();
  });
});

describe('searchDm', () => {
  beforeEach(resetDmCache);
  const web = (calls: string[] = [], down = false) =>
    (async (input: string) => {
      const url = String(input);
      calls.push(url);
      if (down) return new Response('x', { status: 503 });
      if (url === 'https://www.dm.hr/product-sitemap.xml') return new Response(sitemap(['1457962', 'dmbio-tofu-natur'], ['2244975', 'asebon-sampon-protiv-masne-prhuti-normalno-do-masno-vlasiste'], ['1', 'unrelated-product']).replace('/1/unrelated', '/1234/unrelated'));
      if (url.endsWith('/dan/1457962')) return new Response(JSON.stringify(detail()));
      if (url.endsWith('/dan/2244975')) return new Response(JSON.stringify(detail({ title: { headline: 'Šampon protiv masne prhuti, 200 ml' }, brand: { name: 'Asebon' }, gtin: undefined })));
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;

  it('finds a product from the text printed on the receipt, size and accents ignored', async () => {
    const r = await searchDm(['Asebon šampon 200ml'], web());
    expect(r.candidates.map((c) => [c.source, c.name, c.code])).toEqual([['dm', 'Asebon Šampon protiv masne prhuti, 200 ml', '2244975']]);
    const t = await searchDm(['dmBio tofu natur 200 g'], web());
    expect(t.candidates[0]).toMatchObject({ source: 'dm', code: '4067796251999', imageUrl: IMG, pageUrl: 'https://www.dm.hr/p/d/1457962/dmbio-tofu-natur' });
  });
  it('reads the sitemap and each product once', async () => {
    const calls: string[] = [];
    const fetcher = web(calls);
    await searchDm(['dmBio tofu natur'], fetcher);
    await searchDm(['dmBio tofu natur'], fetcher);
    expect(calls.filter((u) => u.includes('sitemap')).length).toBe(1);
    expect(calls.filter((u) => u.endsWith('/dan/1457962')).length).toBe(1);
  });
  it('says so when dm is down, without throwing', async () => {
    const r = await searchDm(['tofu'], web([], true));
    expect(r.candidates).toEqual([]);
    expect(r.error).toMatch(/dm answered 503/);
  });
});
