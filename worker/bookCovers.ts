// Book covers from Open Library (covers.openlibrary.org, openlibrary.org/search.json): public, no key.
// The app asks for a book by ISBN, else by title and author, and gets the cover's bytes back, so it doesn't depend on
// the image host's browser rules. The URLs are built here from the book's fields; the app never passes one in.

const AGENT = 'LifeApp/1.0 (personal life tracker; https://github.com/kevinmorenome/Life)';
const MAX_IMAGE_BYTES = 2_500_000;

export interface CoverQuery {
  /** Open Library's cover id (from the book search): tried first. */
  coverId?: number;
  isbn13?: string;
  isbn?: string;
  title?: string;
  author?: string;
}

export interface Cover {
  bytes: ArrayBuffer;
  type: string;
}

const ISBN = /^(\d{13}|\d{9}[\dX])$/;

/** Lowercase, no accents or punctuation, single spaces: for comparing titles. */
export const foldTitle = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Open Library's title is the same book's when one starts with the other ("Dune" and "Dune: Deluxe Edition"), never a loose match. */
export const sameTitle = (a: string, b: string): boolean => {
  const [x, y] = [foldTitle(a), foldTitle(b)];
  return !!x && !!y && (x === y || x.startsWith(y + ' ') || y.startsWith(x + ' '));
};

/** `default=false` makes Open Library answer 404 instead of a 1×1 blank when it has no cover. */
const byIsbn = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
const byId = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`;

async function image(url: string, doFetch: typeof fetch): Promise<Cover | null> {
  const res = await doFetch(url, { headers: { 'User-Agent': AGENT, Accept: 'image/*' }, signal: AbortSignal.timeout(9000) });
  if (res.status === 404) return null;
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!res.ok || !type.startsWith('image/') || type.includes('svg')) throw new Error(`Open Library answered ${res.status}`);
  const bytes = await res.arrayBuffer();
  // A blank placeholder is a few dozen bytes: not a cover.
  if (bytes.byteLength < 500 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { bytes, type };
}

/** The cover of a book by its ISBNs, else the first search result with a cover whose title is the same. Null when there is none; throws when Open Library can't be reached. */
export async function findCover(q: CoverQuery, doFetch: typeof fetch = fetch): Promise<Cover | null> {
  if (Number.isInteger(q.coverId) && q.coverId! > 0 && q.coverId! < 1e10) {
    const found = await image(byId(q.coverId!), doFetch);
    if (found) return found;
  }
  for (const isbn of [q.isbn13, q.isbn]) {
    if (!isbn || !ISBN.test(isbn)) continue;
    const found = await image(byIsbn(isbn), doFetch);
    if (found) return found;
  }
  const title = (q.title ?? '').trim();
  if (!title) return null;
  const params = new URLSearchParams({ title, limit: '8', fields: 'title,cover_i' });
  if (q.author?.trim()) params.set('author', q.author.trim());
  const res = await doFetch(`https://openlibrary.org/search.json?${params}`, { headers: { 'User-Agent': AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`Open Library answered ${res.status}`);
  const body = (await res.json()) as { docs?: { title?: unknown; cover_i?: unknown }[] };
  const withCover = (body.docs ?? []).filter((d): d is { title: string; cover_i: number } => typeof d.cover_i === 'number' && typeof d.title === 'string' && sameTitle(d.title, title));
  // The exact title first ("Dune" before "Dune Messiah"), then the longer ones.
  withCover.sort((a, b) => Number(foldTitle(b.title) === foldTitle(title)) - Number(foldTitle(a.title) === foldTitle(title)));
  for (const doc of withCover) {
    const found = await image(byId(doc.cover_i), doFetch);
    if (found) return found;
  }
  return null;
}

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** GET /api/books/cover?isbn13=&isbn=&title=&author= → the cover's image, 404 when there is none, 502 when Open Library can't be reached. */
export async function handleBookCover(url: URL, doFetch: typeof fetch = fetch): Promise<Response> {
  const p = url.searchParams;
  const q: CoverQuery = { coverId: Number(p.get('id')) || undefined, isbn13: p.get('isbn13') ?? undefined, isbn: p.get('isbn') ?? undefined, title: (p.get('title') ?? '').slice(0, 200), author: (p.get('author') ?? '').slice(0, 120) };
  try {
    const cover = await findCover(q, doFetch);
    if (!cover) return json({ error: 'No cover found.' }, 404);
    return new Response(cover.bytes, { headers: { 'Content-Type': cover.type, 'Cache-Control': 'private, max-age=86400' } });
  } catch {
    return json({ error: 'Could not reach Open Library.' }, 502);
  }
}
