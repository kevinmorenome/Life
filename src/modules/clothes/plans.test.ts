import { describe, expect, it } from 'vitest';
import { newPlan, pendingPlans, plannedDays, upcomingPlans } from './plans';
import type { Outfit } from './types';

const outfit = (id: string, wears: string[] = []): Outfit => ({ id, itemIds: [], wears, createdAt: 'x', updatedAt: 'x' });

describe('plans', () => {
  it('uses a deterministic id so a duplicate plan overwrites itself', () => {
    expect(newPlan('o1', '2026-11-01').id).toBe(newPlan('o1', '2026-11-01').id);
  });

  it('lists only plans that are still unworn and whose outfit exists', () => {
    const plans = [newPlan('a', '2026-11-01'), newPlan('b', '2026-11-01'), newPlan('gone', '2026-11-01')];
    const outfits = [outfit('a'), outfit('b', ['2026-11-01'])];
    expect(pendingPlans(plans, outfits, '2026-11-01').map((p) => p.outfit.id)).toEqual(['a']);
    expect(pendingPlans(plans, outfits, '2026-11-02')).toEqual([]);
  });

  it('marks planned days, dropping ones already worn', () => {
    const plans = [newPlan('a', '2026-11-01'), newPlan('b', '2026-11-02')];
    const outfits = [outfit('a'), outfit('b', ['2026-11-02'])];
    expect([...plannedDays(plans, outfits)]).toEqual(['2026-11-01']);
  });

  it('returns an outfit’s upcoming plans soonest first, including past unworn ones from `from`', () => {
    const o = outfit('a', ['2026-11-05']);
    const plans = [newPlan('a', '2026-11-05'), newPlan('a', '2026-11-03'), newPlan('a', '2026-10-01'), newPlan('b', '2026-11-04')];
    expect(upcomingPlans(plans, o, '2026-11-01').map((p) => p.date)).toEqual(['2026-11-03']);
  });
});
