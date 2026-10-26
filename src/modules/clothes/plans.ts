import type { Outfit, Plan } from './types';

export function newPlan(outfitId: string, date: string): Plan {
  const now = new Date().toISOString();
  return { id: `${outfitId}_${date}`, date, outfitId, createdAt: now, updatedAt: now };
}

/** Outfits planned for `date` that haven't been worn that day yet, in plan order. */
export function pendingPlans(plans: Plan[], outfits: Outfit[], date: string): { plan: Plan; outfit: Outfit }[] {
  const byId = new Map(outfits.map((o) => [o.id, o]));
  return plans
    .filter((p) => p.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .flatMap((plan) => {
      const outfit = byId.get(plan.outfitId);
      return outfit && !outfit.wears.includes(date) ? [{ plan, outfit }] : [];
    });
}

/** Days with at least one plan still waiting to be worn. */
export function plannedDays(plans: Plan[], outfits: Outfit[]): Set<string> {
  const byId = new Map(outfits.map((o) => [o.id, o]));
  const days = new Set<string>();
  for (const p of plans) {
    const o = byId.get(p.outfitId);
    if (o && !o.wears.includes(p.date)) days.add(p.date);
  }
  return days;
}

/** This outfit's plans from `from` on that haven't been worn, soonest first. */
export function upcomingPlans(plans: Plan[], outfit: Outfit, from: string): Plan[] {
  return plans
    .filter((p) => p.outfitId === outfit.id && p.date >= from && !outfit.wears.includes(p.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}
