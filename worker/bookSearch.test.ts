import { describe, expect, it } from 'vitest';
import { handleBookSearch, hitsFrom } from './bookSearch';

const doc = (extra: Record<string, unknown> = {}) => ({ key: '/works/OL893415W', title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965, isbn: ['0441172717', '9780441172719', 'x'], cover_i: 12345, number_of_pages_median: 412, ...extra });

describe('hitsFrom', () => {
  it('maps a work and picks the ISBNs out of the editions', () => {
    expect(hitsFrom([doc()])).toEqual([{ key: 'OL893415W', title: 'Dune', author: 'Frank Herbert', year: 1965, pages: 412, isbn13: '9780441172719', isbn: '0441172717', coverId: 12345 }]);
  });
  it('keeps co-authors, drops missing fields and skips what has no work key or title', () => {
    const [h] = hitsFrom([doc({ author_name: ['A', 'B'], isbn: undefined, cover_i: undefined })]);
    expect(h.coAuthors).toEqual(['B']);
    expect(Object.keys(h)).not.toContain('coverId');
    expect(Object.keys(h)).not.toContain('isbn13');
    expect(hitsFrom([doc({ key: '/books/OL1M' }), doc({ title: ' ' }), doc({ key: 5 })])).toEqual([]);
  });
  it('says unknown author when there is none and ignores odd values', () => {
    expect(hitsFrom([doc({ author_name: undefined, cover_i: -3, number_of_pages_median: 'x' })])[0]).toMatchObject({ author: 'Unknown author' });
  });
});

describe('handleBookSearch', () => {
  const net = (res: () => Response) => (async () => res()) as unknown as typeof fetch;
  it('answers the results', async () => {
    const r = await handleBookSearch(new URL('https://x/api/books/search?q=dune'), net(() => Response.json({ docs: [doc()] })));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { results: unknown[] }).results).toHaveLength(1);
  });
  it('refuses a very short search and reports a failure', async () => {
    expect((await handleBookSearch(new URL('https://x/api/books/search?q=d'), net(() => Response.json({})))).status).toBe(400);
    expect((await handleBookSearch(new URL('https://x/api/books/search?q=dune'), net(() => new Response('', { status: 503 })))).status).toBe(502);
  });
});
