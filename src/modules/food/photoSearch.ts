import type { PhotoSearchResult } from '../../../worker/openfoodfacts';

export type { PhotoCandidate, PhotoSearchResult } from '../../../worker/openfoodfacts';

/**
 * Pictures of food, through the Worker: Konzum's web shop (found with the text printed on the receipt) and Open
 * Food Facts (by name, or exactly by barcode).
 */
export async function searchPhotoCandidates(input: { query?: string; rawName?: string; code?: string }): Promise<PhotoSearchResult> {
  const params = new URLSearchParams();
  if (input.code?.trim()) params.set('code', input.code.trim());
  else {
    if (input.query?.trim()) params.set('q', input.query.trim());
    if (input.rawName?.trim()) params.set('raw', input.rawName.trim());
  }
  try {
    const res = await fetch(`/api/food/photos?${params}`);
    if (!res.ok) return { candidates: [], error: 'Picture search is not available right now.' };
    return (await res.json()) as PhotoSearchResult;
  } catch {
    return { candidates: [], error: 'Could not reach the picture search. Are you offline?' };
  }
}
