// Finding a book to add by hand: Open Library's search (openlibrary.org/search.json, public, no key).

import type { BookHit } from './bookHit';

const AGENT = 'LifeApp/1.0 (personal life tracker; https://github.com/kevinmorenome/Life)';
const FIELDS = 'key,title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median';

interface Doc {
  key?: unknown;
  title?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
  isbn?: unknown;
  cover_i?: unknown;
  number_of_pages_median?: unknown;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
const posInt = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined);

/** Open Library's docs → the hits the app shows: only works with a key and a title, ISBNs picked from the editions' long list. */
export function hitsFrom(docs: Doc[]): BookHit[] {
  const hits: BookHit[] = [];
  for (const d of docs) {
    const key = typeof d.key === 'string' ? /^\/works\/(OL\d+W)$/.exec(d.key)?.[1] : undefined;
    const title = typeof d.title === 'string' ? d.title.trim() : '';
    if (!key || !title) continue;
    const [author = 'Unknown author', ...coAuthors] = strings(d.author_name).slice(0, 4);
    const isbns = strings(d.isbn);
    const hit: BookHit = {
      key,
      title,
      author,
      coAuthors: coAuthors.length ? coAuthors : undefined,
      year: posInt(d.first_publish_year),
      pages: posInt(d.number_of_pages_median),
      isbn13: isbns.find((i) => /^\d{13}$/.test(i)),
      isbn: isbns.find((i) => /^\d{9}[\dX]$/.test(i)),
      coverId: posInt(d.cover_i),
    };
    for (const k of Object.keys(hit) as (keyof BookHit)[]) if (hit[k] === undefined) delete hit[k];
    hits.push(hit);
  }
  return hits;
}

/** Up to 12 books matching the words; throws when Open Library can't be reached. */
export async function searchOpenLibrary(query: string, doFetch: typeof fetch = fetch): Promise<BookHit[]> {
  const params = new URLSearchParams({ q: query, limit: '12', fields: FIELDS });
  const res = await doFetch(`https://openlibrary.org/search.json?${params}`, { headers: { 'User-Agent': AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`Open Library answered ${res.status}`);
  const body = (await res.json()) as { docs?: Doc[] };
  return hitsFrom(Array.isArray(body.docs) ? body.docs : []);
}

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** GET /api/books/search?q=<words> → `{ results: BookHit[] }`; 400 for fewer than 2 characters, 502 when Open Library can't be reached. */
export async function handleBookSearch(url: URL, doFetch: typeof fetch = fetch): Promise<Response> {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  if (q.length < 2) return json({ error: 'Type at least two letters.' }, 400);
  try {
    return new Response(JSON.stringify({ results: await searchOpenLibrary(q, doFetch) }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' } });
  } catch {
    return json({ error: 'Could not reach Open Library.' }, 502);
  }
}
