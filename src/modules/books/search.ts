import type { BookHit } from '../../../worker/bookHit';

/** Books matching the words, from Open Library through the Worker. Throws with a message to show when it can't search. */
export async function searchBooksOnline(query: string): Promise<BookHit[]> {
  const res = await fetch(`/api/books/search?${new URLSearchParams({ q: query })}`);
  // Without the Worker (the plain dev server) the answer is the app's own page, not JSON.
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error(res.status === 400 ? 'Type at least two letters.' : 'Could not search right now. Try again in a moment.');
  const body = (await res.json()) as { results?: BookHit[] };
  return Array.isArray(body.results) ? body.results : [];
}
