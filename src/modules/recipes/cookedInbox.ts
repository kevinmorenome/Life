import type { CookedRequest, InboxRequest } from '../../../worker/protocol';
import { markCooked } from './cooking';
import type { Recipe } from './types';

/** Applied requests are kept this long (so a sync from another device sees them done), then dropped. */
const KEEP_APPLIED_DAYS = 30;

export interface CookedResult {
  recipes: Recipe[];
  requests: InboxRequest[];
  expired: string[];
}

/**
 * Applies `cooked` requests queued by Claude (`log_cooked`): each adds its day to the recipe's cooked days, once per
 * day (`markCooked`), so applying twice changes nothing. A request for a recipe that no longer exists is marked
 * applied with an error. Pure: the caller saves what comes back.
 */
export function applyCooked(requests: InboxRequest[], recipes: Recipe[], now: Date): CookedResult {
  const mine = requests.filter((r): r is CookedRequest => r.type === 'cooked');
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const changed = new Set<string>();
  const applied: InboxRequest[] = [];
  const stamp = now.toISOString();
  for (const req of mine.filter((r) => !r.appliedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const recipe = byId.get(req.recipeId);
    if (!recipe) {
      applied.push({ ...req, appliedAt: stamp, updatedAt: stamp, error: `No longer exists: ${req.recipeId}` });
      continue;
    }
    if (!(recipe.cooked ?? []).includes(req.date)) {
      byId.set(recipe.id, markCooked(recipe, req.date, stamp));
      changed.add(recipe.id);
    }
    applied.push({ ...req, appliedAt: stamp, updatedAt: stamp });
  }
  const cutoff = new Date(now.getTime() - KEEP_APPLIED_DAYS * 86_400_000).toISOString();
  return {
    recipes: [...changed].map((id) => byId.get(id)!),
    requests: applied,
    expired: mine.filter((r) => r.appliedAt && r.appliedAt < cutoff).map((r) => r.id),
  };
}
