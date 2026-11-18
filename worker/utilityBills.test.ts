import { describe, expect, it } from 'vitest';
import { parseUtilityBills } from './utilityBills';

describe('parseUtilityBills', () => {
  it('reads a full water bill', () => {
    const { bills, rejected } = parseUtilityBills([
      {
        utility: 'water', sourceId: '57196739', number: '245926-PZ1-2', periodStart: '2026-07-31', periodEnd: '2026-08-30', due: '2026-09-30', amount: 62.19,
        consumption: 11, readingStart: 514, readingEnd: 525, paidOn: '2026-09-20', paidBy: 'other',
        lines: [{ label: 'Vodoopskrba', amount: 7.92, quantity: 11, unit: 'm3', unitPrice: 0.72 }, { label: '', amount: 1 }, { label: 'bad' }],
      },
    ]);
    expect(rejected).toEqual([]);
    expect(bills[0]).toMatchObject({ id: 'bill-water-57196739', month: '2026-08', amount: 62.19, consumption: 11, paidBy: 'other', lines: [{ label: 'Vodoopskrba', unitPrice: 0.72 }] });
    expect(bills[0].lines).toHaveLength(1);
  });
  it('drops what is off-schema and keeps a payer only with a payment day', () => {
    const { bills, rejected } = parseUtilityBills([
      { utility: 'electricity', sourceId: 'x', month: '2026-01', amount: 5 },
      { utility: 'gas', sourceId: '1/2024', month: '2024-01', amount: 203.54, paidBy: 'kevin', due: '2024-13-45' },
      { utility: 'gas', sourceId: '1/2024', month: '2024-01', amount: 1 },
      { utility: 'gas', sourceId: 'neg', month: '2024-01', amount: -4 },
    ]);
    expect(rejected).toHaveLength(2);
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ id: 'bill-gas-1-2024' });
    expect(bills[0]).not.toHaveProperty('paidBy');
    expect(bills[0]).not.toHaveProperty('due');
  });
});
