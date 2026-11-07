import { describe, expect, it } from 'vitest';
import { blankDraft, draftToLine, groupLines, lineToDraft, parseNumber, linePaid, linesTotal, monthlySpend, receiptTotal, sortReceipts, spendByKind, totalSaved } from './food';
import type { FoodReceipt, ReceiptLine } from './types';

const line = (over: Partial<ReceiptLine>): ReceiptLine => ({ name: 'x', kind: 'food', quantity: 1, unit: 'pc', unitPrice: 1, discount: 0, paid: 1, ...over });
const receipt = (over: Partial<FoodReceipt>): FoodReceipt => ({ id: 'r', store: 'Konzum', date: '2026-10-31', lines: [], createdAt: '', updatedAt: '', ...over });

describe('linePaid', () => {
  it('multiplies quantity by the price charged (a discount is already inside it)', () => {
    expect(linePaid(0.48, 5.99)).toBe(2.88);
    expect(linePaid(2, 8.89)).toBe(17.78);
    expect(linePaid(0.224, 1.89)).toBe(0.42);
  });
});

describe('receipt sums', () => {
  const lines = [line({ paid: 17.78, kind: 'alcohol', discount: 0 }), line({ paid: 2.45 }), line({ paid: 1.6, kind: 'deposit' }), line({ paid: 1.79, discount: 0.66 })];
  it('adds up the lines', () => expect(linesTotal(lines)).toBe(23.62));
  it('prefers the printed total', () => {
    expect(receiptTotal({ lines, total: 50.76 })).toBe(50.76);
    expect(receiptTotal({ lines })).toBe(23.62);
  });
  it('splits spend by kind', () => expect(spendByKind(lines)).toEqual({ alcohol: 17.78, food: 4.24, deposit: 1.6 }));
  it('totals the discounts', () => expect(totalSaved(lines)).toBe(0.66));
  it('groups lines food first, skipping empty kinds', () => expect(groupLines(lines).map((g) => g.kind)).toEqual(['food', 'alcohol', 'deposit']));
});

describe('monthlySpend', () => {
  it('groups by month, newest first, with kinds', () => {
    const out = monthlySpend([
      receipt({ date: '2026-09-30', lines: [line({ paid: 10 })] }),
      receipt({ date: '2026-10-02', lines: [line({ paid: 5 }), line({ paid: 3, kind: 'alcohol' })] }),
      receipt({ date: '2026-10-31', lines: [line({ paid: 2 })] }),
    ]);
    expect(out.map((m) => m.month)).toEqual(['2026-10', '2026-09']);
    expect(out[0]).toEqual({ month: '2026-10', total: 10, byKind: { food: 7, alcohol: 3 } });
  });
});

describe('sortReceipts', () => {
  it('puts the newest first, later time first on the same day', () => {
    const sorted = sortReceipts([receipt({ id: 'a', date: '2026-10-30' }), receipt({ id: 'b', date: '2026-10-31', time: '09:00' }), receipt({ id: 'c', date: '2026-10-31', time: '15:37' })]);
    expect(sorted.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('parseNumber', () => {
  it('accepts a comma or a point', () => {
    expect(parseNumber('5,99')).toBe(5.99);
    expect(parseNumber(' 0.48 ')).toBe(0.48);
    expect(parseNumber('2')).toBe(2);
  });
  it('rejects anything else', () => {
    for (const t of ['', 'abc', '-1', '1,2,3', '1e3']) expect(parseNumber(t)).toBeUndefined();
  });
});

describe('line drafts', () => {
  it('turns a typed line into a saved one with the amount recomputed', () => {
    expect(draftToLine({ ...blankDraft(), name: ' Chicken fillet ', quantity: '0,48', unit: 'kg', unitPrice: '5,99', discount: '0,67' })).toEqual({
      name: 'Chicken fillet', rawName: undefined, kind: 'food', quantity: 0.48, unit: 'kg', unitPrice: 5.99, discount: 0.67, paid: 2.88,
    });
  });
  it('skips lines that are not finished', () => {
    expect(draftToLine({ ...blankDraft(), name: '', unitPrice: '1' })).toBeUndefined();
    expect(draftToLine({ ...blankDraft(), name: 'Milk' })).toBeUndefined();
    expect(draftToLine({ ...blankDraft(), name: 'Milk', quantity: '0', unitPrice: '1' })).toBeUndefined();
  });
  it('round-trips a saved line, keeping the printed name', () => {
    const saved = line({ name: 'Oat milk', rawName: 'NAP ZOB', quantity: 2, unitPrice: 4.19, discount: 0.5, paid: 8.38 });
    expect(draftToLine(lineToDraft(saved))).toEqual(saved);
  });
});
