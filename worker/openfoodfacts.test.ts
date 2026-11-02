import { describe, expect, it } from 'vitest';
import { handleFoodPhotos, parseCandidates, searchPhotos } from './openfoodfacts';

const img = (code: string) => `https://images.openfoodfacts.org/images/products/${code}/front_en.3.400.jpg`;
const product = (code: string, extra: object = {}) => ({ code, product_name: `Product ${code}`, brands: 'Brand', quantity: '330 ml', image_front_url: img(code), countries_tags: ['en:germany'], ...extra });
const fakeFetch = (bodies: Array<{ status?: number; body?: unknown }>) => {
  const calls: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    const next = bodies[Math.min(calls.length - 1, bodies.length - 1)];
    expect((init?.headers as Record<string, string>)['User-Agent']).toMatch(/LifeApp/);
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
};

describe('parseCandidates', () => {
  it('keeps products with a front picture from Open Food Facts and tidies the fields', () => {
    const out = parseCandidates({ products: [product('1'), product('2', { image_front_url: undefined }), product('3', { image_front_url: 'https://evil.example/x.jpg' }), product('4', { product_name: '  ' })] });
    expect(out.map((c) => c.code)).toEqual(['1', '4']);
    expect(out[0]).toEqual({ code: '1', name: 'Product 1', brand: 'Brand', quantity: '330 ml', country: 'germany', imageUrl: img('1') });
    expect(out[1].name).toBe('Brand');
  });
  it('puts Croatian and nearby products first, otherwise keeps the order', () => {
    const out = parseCandidates({ products: [product('a', { countries_tags: ['en:belgium'] }), product('b', { countries_tags: ['en:germany'] }), product('c', { countries_tags: ['en:croatia'] }), product('d', { countries_tags: ['en:belgium'] })] });
    expect(out.map((c) => c.code)).toEqual(['c', 'b', 'a', 'd']);
  });
  it('reads a single product response and survives junk', () => {
    expect(parseCandidates({ product: product('9') }).map((c) => c.code)).toEqual(['9']);
    for (const junk of [null, 'x', 5, [], { products: 'no' }, { products: [null, 3, 'x'] }]) expect(parseCandidates(junk)).toEqual([]);
  });
  it('returns at most nine', () => {
    expect(parseCandidates({ products: Array.from({ length: 20 }, (_, i) => product(String(i))) })).toHaveLength(9);
  });
});

describe('searchPhotos', () => {
  it('searches by words and identifies itself', async () => {
    const { f, calls } = fakeFetch([{ body: { products: [product('1')] } }]);
    const r = await searchPhotos({ query: 'somersby cider' }, f);
    expect(r.candidates).toHaveLength(1);
    expect(calls[0]).toContain('search_terms=somersby+cider');
  });
  it('looks a barcode up exactly and rejects a bad one without asking', async () => {
    const { f, calls } = fakeFetch([{ body: { product: product('3850131003398') } }]);
    expect((await searchPhotos({ code: '3850 1310 03398' }, f)).candidates[0].code).toBe('3850131003398');
    expect(calls[0]).toContain('/api/v2/product/3850131003398.json');
    const bad = await searchPhotos({ code: '12ab' }, f);
    expect(bad.error).toMatch(/barcode/);
    expect(calls).toHaveLength(1);
  });
  it('needs a barcode or words', async () => {
    expect((await searchPhotos({}, fakeFetch([{}]).f)).error).toMatch(/Give a barcode/);
  });
  it('tries once more when Open Food Facts is busy, then says so', async () => {
    const once = fakeFetch([{ status: 503 }, { body: { products: [product('1')] } }]);
    expect((await searchPhotos({ query: 'x' }, once.f)).candidates).toHaveLength(1);
    expect(once.calls).toHaveLength(2);
    const busy = await searchPhotos({ query: 'x' }, fakeFetch([{ status: 503 }]).f);
    expect(busy).toEqual({ candidates: [], error: 'Open Food Facts is busy right now' });
  });
  it('reports other failures instead of throwing', async () => {
    expect((await searchPhotos({ query: 'x' }, fakeFetch([{ status: 500 }]).f)).error).toMatch(/500/);
    const down = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
    expect((await searchPhotos({ query: 'x' }, down)).error).toBe('network');
  });
});

describe('handleFoodPhotos', () => {
  it('answers with JSON from the query string', async () => {
    const { f } = fakeFetch([{ body: { products: [product('1')] } }]);
    const res = await handleFoodPhotos(new URL('https://x/api/food/photos?q=chips'), f);
    expect(((await res.json()) as { candidates: unknown[] }).candidates).toHaveLength(1);
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});
