import { beforeEach, describe, expect, it } from 'vitest';
import { allowedImage, handleFoodPhotoImage, handleFoodPhotos, searchAllPhotos } from './foodPhotos';
import { resetDmCache } from './dm';
import { resetKonzumCache } from './konzum';

const KONZUM_IMG = 'https://d17zv3ray5yxvp.cloudfront.net/variants/abc/def';
const DM_IMG = 'https://products.dm-static.com/images/f_auto,q_auto,c_fit,h_440,w_500/v1/assets/pas/images/abc/dm-sampon-test';
const OFF_IMG = 'https://images.openfoodfacts.org/images/products/385/013/100/3398/front_hr.3.400.jpg';
const page = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Staropramen Svijetlo pivo 6x0,5 l', image: KONZUM_IMG, sku: '90770559', brand: 'ZAGREBAČKA PIVOVARA d.o.o.' })}</script>`;
const offBody = { products: [{ code: '3850131003398', product_name: 'Staropramen', brands: 'Staropramen', quantity: '0,5 l', image_front_url: OFF_IMG, countries_tags: ['en:croatia'] }] };

/** A fake internet with Konzum's sitemap and one product page, and Open Food Facts. */
const web = (opts: { konzumDown?: boolean; offDown?: boolean; calls?: string[] } = {}) =>
  (async (input: string) => {
    const url = String(input);
    opts.calls?.push(url);
    if (url.startsWith('https://www.dm.hr/')) return new Response('<loc>https://www.dm.hr/p/d/1234567/dm-sampon-test</loc>');
    if (url.startsWith('https://products.dm.de/')) return new Response(JSON.stringify({ title: { headline: 'Šampon test' }, brand: { name: 'dm' }, images: [{ src: DM_IMG }] }));
    if (url.startsWith('https://www.konzum.hr/')) {
      if (opts.konzumDown) return new Response('x', { status: 503 });
      if (url.endsWith('sitemap_products.xml')) return new Response("<loc>https://www.konzum.hr/web/products/staropramen-pivo-6pack-0-5l-lim</loc><loc>https://www.konzum.hr/web/products/mrkva</loc>");
      return new Response(page);
    }
    if (url.includes('openfoodfacts.org')) return opts.offDown ? new Response('x', { status: 500 }) : new Response(JSON.stringify(offBody));
    return new Response('bytes', { headers: { 'content-type': 'image/jpeg' } });
  }) as unknown as typeof fetch;

beforeEach(() => {
  resetKonzumCache();
  resetDmCache();
});

describe('searchAllPhotos', () => {
  it("puts Konzum's match first, then Open Food Facts', each marked with where it came from", async () => {
    const r = await searchAllPhotos({ query: 'Staropramen beer 6-pack', rawName: 'PIVO STAROPRAMEN 6PA' }, web());
    expect(r.candidates.map((c) => [c.source, c.imageUrl])).toEqual([['Konzum', KONZUM_IMG], ['Open Food Facts', OFF_IMG]]);
    expect(r.error).toBeUndefined();
  });
  it('looks a barcode up at Open Food Facts only', async () => {
    const calls: string[] = [];
    const r = await searchAllPhotos({ code: '3850131003398', rawName: 'PIVO' }, web({ calls }));
    expect(r.candidates.map((c) => c.source)).toEqual(['Open Food Facts']);
    expect(calls.every((u) => u.includes('openfoodfacts.org'))).toBe(true);
  });
  it('still answers when one source is down, and says so only when there is nothing', async () => {
    expect((await searchAllPhotos({ rawName: 'PIVO STAROPRAMEN' }, web({ konzumDown: true }))).candidates.map((c) => c.source)).toEqual(['Open Food Facts']);
    resetKonzumCache();
    expect((await searchAllPhotos({ rawName: 'PIVO STAROPRAMEN' }, web({ offDown: true }))).candidates.map((c) => c.source)).toEqual(['Konzum']);
    resetKonzumCache();
    expect((await searchAllPhotos({ query: 'x' }, web({ konzumDown: true, offDown: true }))).error).toBeTruthy();
  });
  it('needs something to search for', async () => {
    expect((await searchAllPhotos({}, web())).error).toMatch(/Give a barcode/);
    expect((await searchAllPhotos({ query: '  ' }, web())).error).toMatch(/Give a barcode/);
  });
  it('does not list the same picture twice', async () => {
    const same = (async (u: string) => (String(u).includes('konzum') ? (String(u).endsWith('sitemap_products.xml') ? new Response('<loc>https://www.konzum.hr/web/products/staropramen-pivo</loc>') : new Response(page)) : new Response(JSON.stringify({ products: [{ code: '1', product_name: 'x', image_front_url: OFF_IMG, countries_tags: [] }] })))) as unknown as typeof fetch;
    const r = await searchAllPhotos({ query: 'staropramen' }, same);
    expect(r.candidates).toHaveLength(2);
    expect(new Set(r.candidates.map((c) => c.imageUrl)).size).toBe(2);
  });
});

describe('handleFoodPhotos', () => {
  it('reads name, receipt text and barcode from the query string', async () => {
    const res = await handleFoodPhotos(new URL('https://x/api/food/photos?q=Staropramen%20beer&raw=PIVO%20STAROPRAMEN%206PA'), web());
    expect(((await res.json()) as { candidates: { source: string }[] }).candidates[0].source).toBe('Konzum');
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});

describe('handleFoodPhotoImage', () => {
  const ask = (u: string, f = web()) => handleFoodPhotoImage(new URL(`https://x/api/food/photo-image?url=${encodeURIComponent(u)}`), f);
  it('only fetches pictures from the hosts the searches return', () => {
    expect([KONZUM_IMG, OFF_IMG, 'https://evil.example/x.jpg', 'http://images.openfoodfacts.org/x.jpg', 'https://d17zv3ray5yxvp.cloudfront.net.evil.example/x', 'file:///etc/passwd', ''].map(allowedImage)).toEqual([true, true, false, false, false, false, false]);
  });
  it('returns the picture with its type', async () => {
    const res = await ask(KONZUM_IMG);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(await res.text()).toBe('bytes');
  });
  it('refuses other hosts without fetching, and anything that is not a picture, is empty or is too big', async () => {
    const calls: string[] = [];
    expect((await ask('https://evil.example/x.jpg', web({ calls }))).status).toBe(400);
    expect(calls).toEqual([]);
    const html = (async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    const svg = (async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })) as unknown as typeof fetch;
    const empty = (async () => new Response('', { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch;
    const huge = (async () => new Response(new Uint8Array(2_600_000), { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch;
    const down = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
    for (const f of [html, svg, empty, huge, down]) expect((await ask(KONZUM_IMG, f)).status).toBe(502);
  });
});

describe('searchAllPhotos with dm', () => {
  it("puts dm's match first for a product bought at dm, and last of the shops otherwise", async () => {
    const dmFirst = await searchAllPhotos({ rawName: 'dm šampon test', store: 'dm' }, web());
    expect(dmFirst.candidates[0]).toMatchObject({ source: 'dm', imageUrl: DM_IMG });
    const elsewhere = await searchAllPhotos({ rawName: 'PIVO STAROPRAMEN dm šampon test', store: 'Konzum' }, web());
    expect(elsewhere.candidates.map((c) => c.source)).toEqual(['Konzum', 'dm', 'Open Food Facts']);
  });
  it('lets the app download dm pictures, and nothing else from its host', () => {
    expect(allowedImage(DM_IMG)).toBe(true);
    expect(allowedImage('https://products.dm.de/product/products/detail/hr/dan/1')).toBe(false);
  });
});
