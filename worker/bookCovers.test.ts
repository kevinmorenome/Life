import { describe, expect, it } from 'vitest';
import { findCover, handleBookCover, sameTitle } from './bookCovers';

const IMG = new Uint8Array(900).fill(7);
const imageRes = () => new Response(IMG, { headers: { 'Content-Type': 'image/jpeg' } });
const notFound = () => new Response('', { status: 404 });

/** A fake network: `routes` maps a URL fragment to a response; anything else is a 404. Records the URLs asked. */
function net(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const doFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    return key ? routes[key]() : notFound();
  }) as typeof fetch;
  return { asked, doFetch };
}

describe('sameTitle', () => {
  it('matches the same book and its longer edition titles, not a different book', () => {
    expect(sameTitle('Dune', 'dune')).toBe(true);
    expect(sameTitle('Dune', 'Dune: Deluxe Edition')).toBe(true);
    expect(sameTitle('Élan', 'elan')).toBe(true);
    expect(sameTitle('Dune', 'Dune Messiah')).toBe(true); // starts with the same word: accepted only after the author filter
    expect(sameTitle('Dune', 'Duned')).toBe(false);
    expect(sameTitle('Dune', 'Piranesi')).toBe(false);
    expect(sameTitle('', 'Dune')).toBe(false);
  });
});

describe('findCover', () => {
  it('uses the ISBN-13 first', async () => {
    const { doFetch, asked } = net({ '/isbn/9780441172719-L.jpg': imageRes });
    const cover = await findCover({ isbn13: '9780441172719', isbn: '0441172717', title: 'Dune' }, doFetch);
    expect(cover?.type).toBe('image/jpeg');
    expect(asked).toHaveLength(1);
  });
  it('tries the ISBN-10 when the ISBN-13 has no cover', async () => {
    const { doFetch } = net({ '/isbn/0441172717-L.jpg': imageRes });
    expect(await findCover({ isbn13: '9780441172719', isbn: '0441172717' }, doFetch)).not.toBeNull();
  });
  it('ignores something that is not an ISBN', async () => {
    const { doFetch, asked } = net({});
    expect(await findCover({ isbn: '../../etc', title: '' }, doFetch)).toBeNull();
    expect(asked).toEqual([]);
  });
  it('searches by title and author, and only takes a result with the same title', async () => {
    const { doFetch, asked } = net({
      'search.json': () => Response.json({ docs: [{ title: 'Something else', cover_i: 1 }, { title: 'No cover here' }, { title: 'Good Omens', cover_i: 42 }] }),
      '/id/42-L.jpg': imageRes,
    });
    expect(await findCover({ title: 'Good Omens', author: 'Terry Pratchett' }, doFetch)).not.toBeNull();
    expect(asked[0]).toContain('author=Terry+Pratchett');
    expect(asked.some((u) => u.includes('/id/1-'))).toBe(false);
  });
  it('prefers the exact title over a longer one', async () => {
    const { doFetch, asked } = net({
      'search.json': () => Response.json({ docs: [{ title: 'Dune Messiah', cover_i: 1 }, { title: 'Dune', cover_i: 2 }] }),
      '/id/': imageRes,
    });
    await findCover({ title: 'Dune', author: 'Frank Herbert' }, doFetch);
    expect(asked[1]).toContain('/id/2-');
  });
  it('is null when nothing matches or the image is a blank placeholder', async () => {
    expect(await findCover({ title: 'X' }, net({ 'search.json': () => Response.json({ docs: [] }) }).doFetch)).toBeNull();
    const tiny = () => new Response(new Uint8Array(40), { headers: { 'Content-Type': 'image/gif' } });
    expect(await findCover({ isbn13: '9780441172719' }, net({ '/isbn/': tiny }).doFetch)).toBeNull();
  });
  it('throws when Open Library fails, so the app does not remember "no cover"', async () => {
    await expect(findCover({ title: 'X' }, net({ 'search.json': () => new Response('', { status: 503 }) }).doFetch)).rejects.toThrow();
  });
});

describe('findCover by cover id', () => {
  it('asks for the cover id first, and only takes a whole number', async () => {
    const { doFetch, asked } = net({ '/id/777-L.jpg': imageRes });
    expect(await findCover({ coverId: 777, isbn13: '9780441172719' }, doFetch)).not.toBeNull();
    expect(asked).toHaveLength(1);
    const none = net({});
    await findCover({ coverId: 1.5 }, none.doFetch);
    expect(none.asked).toEqual([]);
  });
});

describe('handleBookCover', () => {
  it('answers the image, 404 for none and 502 for a failure', async () => {
    const ok = await handleBookCover(new URL('https://x/api/books/cover?isbn13=9780441172719'), net({ '/isbn/': imageRes }).doFetch);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/jpeg');
    expect((await handleBookCover(new URL('https://x/api/books/cover?title=Nope'), net({ 'search.json': () => Response.json({ docs: [] }) }).doFetch)).status).toBe(404);
    expect((await handleBookCover(new URL('https://x/api/books/cover?title=Nope'), net({ 'search.json': () => new Response('', { status: 500 }) }).doFetch)).status).toBe(502);
  });
});
