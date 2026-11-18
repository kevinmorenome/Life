import { describe, expect, it } from 'vitest';
import { billYears, byPaidDate, consumptionSeries, fixedPart, kevinShare, monthlySpend, newestFirst, paidByOther, pendingBills, searchBills, yearSummary } from './bills';
import type { UtilityBill } from './types';

const bill = (o: Partial<UtilityBill> & { id: string }): UtilityBill => ({ utility: 'water', month: '2026-01', amount: 10, createdAt: '', updatedAt: '', ...o });

describe('kevinShare', () => {
  it('is half until 2027 and everything after', () => {
    expect(kevinShare(bill({ id: 'a', month: '2026-12', amount: 11.07 }))).toBe(5.54);
    expect(kevinShare(bill({ id: 'b', month: '2027-01', amount: 11.07 }))).toBe(11.07);
  });
});

describe('lists', () => {
  const bills = [
    bill({ id: 'a', month: '2026-01', paidOn: '2026-02-03' }),
    bill({ id: 'b', month: '2026-03' }),
    bill({ id: 'c', month: '2026-02', utility: 'gas', paidOn: '2026-02-03' }),
  ];
  it('sorts newest month first and finds the pending ones', () => {
    expect(newestFirst(bills).map((b) => b.id)).toEqual(['b', 'c', 'a']);
    expect(pendingBills(bills).map((b) => b.id)).toEqual(['b']);
  });
  it('groups by the day paid, never by due date', () => {
    const map = byPaidDate(bills.map((b) => ({ ...b, due: '2026-12-31' })));
    expect([...map.keys()]).toEqual(['2026-02-03']);
    expect(map.get('2026-02-03')).toHaveLength(2);
  });
  it('searches number, month and utility', () => {
    expect(searchBills([bill({ id: 'a', number: '57196739' }), bill({ id: 'b', utility: 'gas' })], 'gas').map((b) => b.id)).toEqual(['b']);
    expect(searchBills([bill({ id: 'a', number: '57196739' })], '5719')).toHaveLength(1);
  });
});

describe('spend', () => {
  const bills = [bill({ id: 'a', month: '2026-01', amount: 10.5 }), bill({ id: 'b', month: '2026-01', utility: 'gas', amount: 4.25 }), bill({ id: 'c', month: '2025-11', amount: 7 })];
  it('adds per month with empty months as zero', () => {
    const m = monthlySpend(bills, '2026-02', 4);
    expect(m.map((r) => r.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(m[2]).toEqual({ month: '2026-01', water: 10.5, gas: 4.25, total: 14.75 });
    expect(m[1].total).toBe(0);
  });
  it('summarises a year with Kevin’s part and consumption', () => {
    const s = yearSummary([bill({ id: 'a', month: '2026-05', amount: 20, consumption: 8 }), bill({ id: 'b', month: '2027-02', amount: 30, utility: 'gas', consumption: 40 })], '2027');
    expect(s).toMatchObject({ bills: 1, total: 30, gas: 30, kevin: 30, gasSm3: 40, waterM3: 0 });
    expect(billYears([bill({ id: 'a', month: '2026-05' }), bill({ id: 'b', month: '2024-01' })])).toEqual(['2026', '2024']);
  });
});

describe('paidByOther', () => {
  it('totals what the other person paid and Kevin’s half', () => {
    const r = paidByOther([
      bill({ id: 'a', month: '2026-03', amount: 62.19, paidOn: '2026-04-01', paidBy: 'other' }),
      bill({ id: 'b', month: '2026-03', utility: 'gas', amount: 10, paidOn: '2026-04-01', paidBy: 'other' }),
      bill({ id: 'c', month: '2026-04', amount: 99, paidOn: '2026-05-01', paidBy: 'kevin' }),
      bill({ id: 'd', month: '2026-05', amount: 50, paidBy: 'other' }),
    ]);
    expect(r).toEqual({ bills: 2, water: 62.19, gas: 10, total: 72.19, kevinOwes: 36.1 });
  });
});

describe('consumption', () => {
  it('lists bills with consumption oldest first and prices a unit', () => {
    const s = consumptionSeries(
      [bill({ id: 'b', utility: 'gas', month: '2024-03', amount: 22.45, consumption: 29, estimated: true }), bill({ id: 'a', utility: 'gas', month: '2023-12', amount: 1.4, consumption: 0 }), bill({ id: 'x', utility: 'gas', month: '2024-01' })],
      'gas',
    );
    expect(s.map((p) => p.month)).toEqual(['2023-12', '2024-03']);
    expect(s[0].perUnit).toBeUndefined();
    expect(s[1]).toMatchObject({ perUnit: 0.77, estimated: true });
  });
  it('finds the fixed part of a breakdown', () => {
    expect(fixedPart(bill({ id: 'a', lines: [{ label: 'Vodoopskrba', amount: 7.92 }, { label: 'Fiksni dio cijene - odvodnja', amount: 4.03 }, { label: 'Fiksni dio cijene - vodoopskrba', amount: 20.48 }] }))).toBe(24.51);
  });
});
