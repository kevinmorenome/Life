import { describe, expect, it } from 'vitest';
import { paidByOther, pendingBills } from './bills';
import { sampleBills } from './sampleBills';

describe('sampleBills', () => {
  const bills = sampleBills(new Date('2026-11-18T10:00:00Z'), '2026-11-18');
  it('makes 14 months of water and gas with fixed ids', () => {
    expect(bills).toHaveLength(28);
    expect(new Set(bills.map((b) => b.id)).size).toBe(28);
    expect(bills[bills.length - 1].month).toBe('2026-11');
  });
  it('leaves the newest water bill pending, nothing paid in the future, some paid by the other person', () => {
    expect(pendingBills(bills).some((b) => b.id === 'bill-water-sample-2026-11')).toBe(true);
    expect(bills.every((b) => !b.paidOn || b.paidOn <= '2026-11-18')).toBe(true);
    expect(paidByOther(bills).bills).toBeGreaterThan(0);
  });
});
