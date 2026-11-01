import { describe, expect, it } from 'vitest';
import { parseGroceryReceipt } from './groceries';

const base = { store: 'Konzum', date: '2026-10-31', time: '15:37' };

describe('parseGroceryReceipt', () => {
  it('needs a store and at least one valid line', () => {
    expect(parseGroceryReceipt({ lines: [{ name: 'Milk', quantity: 1, unitPrice: 1 }] }, '2026-11-01')).toBeUndefined();
    expect(parseGroceryReceipt({ store: 'Konzum', lines: [{ name: '', quantity: 1, unitPrice: 1 }] }, '2026-11-01')).toBeUndefined();
  });

  it('recomputes the amount paid from quantity, price and discount', () => {
    const out = parseGroceryReceipt({ ...base, lines: [{ name: 'Chicken fillet', kind: 'food', quantity: 0.48, unit: 'kg', unitPrice: 5.99, discount: 0.67, paid: 99 }] }, '2026-11-01');
    expect(out?.receipt.lines[0]).toMatchObject({ quantity: 0.48, unit: 'kg', paid: 2.21 });
  });

  it('falls back on bad dates, kinds and units, and drops invalid lines', () => {
    const out = parseGroceryReceipt(
      { store: 'Konzum', date: '2026-02-31', time: '25:00', lines: [{ name: 'Beer', kind: 'booze', unit: 'crate', quantity: 2, unitPrice: 8.89 }, { name: 'Bad', quantity: -1, unitPrice: 1 }, 'junk'] },
      '2026-11-01',
    );
    expect(out?.receipt).toMatchObject({ date: '2026-11-01', time: undefined });
    expect(out?.receipt.lines).toHaveLength(1);
    expect(out?.receipt.lines[0]).toMatchObject({ kind: 'food', unit: 'pc', paid: 17.78 });
  });

  it('flags a printed total that does not match the lines', () => {
    const lines = [{ name: 'Chips', quantity: 1, unitPrice: 2.45 }, { name: 'Deposit', kind: 'deposit', quantity: 4, unitPrice: 0.1 }];
    expect(parseGroceryReceipt({ ...base, total: 2.85, lines }, 'x')?.mismatch).toBeUndefined();
    expect(parseGroceryReceipt({ ...base, total: 10, lines }, 'x')?.mismatch).toEqual({ printed: 10, summed: 2.85 });
  });
});
