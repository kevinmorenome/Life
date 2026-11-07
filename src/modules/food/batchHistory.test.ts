import { describe, expect, it } from 'vitest';
import { historyNotes, historyText } from './batchHistory';
import type { HistoryEntry } from './stock';

const amount = (q: number) => `${q} kg`;
const h = (over: Partial<HistoryEntry>): HistoryEntry => ({ date: '2026-11-02', kind: 'used', quantity: 0.3, ...over });

describe('historyText', () => {
  it('says what happened, with the amount', () => {
    expect(historyText(h({ kind: 'bought', quantity: 1 }), amount)).toBe('Bought 1 kg');
    expect(historyText(h({}), amount)).toBe('Used 0.3 kg');
    expect(historyText(h({ kind: 'tossed' }), amount)).toBe('Threw out 0.3 kg');
    expect(historyText(h({ kind: 'finished', quantity: 0.4 }), amount)).toBe('Finished');
    expect(historyText(h({ kind: 'adjusted', quantity: -0.5 }), amount)).toBe('Counted down by 0.5 kg');
    expect(historyText(h({ kind: 'moved-out', to: 'freezer' }), amount)).toBe('Put 0.3 kg in the freezer');
    expect(historyText(h({ kind: 'moved-out', to: 'thawed' }), amount)).toBe('Took 0.3 kg out of the freezer');
    expect(historyText(h({ kind: 'frozen' }), amount)).toBe('Frozen: 0.3 kg');
    expect(historyText(h({ kind: 'thawed' }), amount)).toBe('Thawed: 0.3 kg');
    expect(historyText(h({ kind: 'confirmed' }), amount)).toBe('Still have: 0.3 kg');
    expect(historyText(h({ kind: 'expiry', quantity: undefined, useBy: '2026-11-10' }), amount)).toBe('Use-by date set');
    expect(historyText(h({ kind: 'assumed-eaten' }), amount)).toBe('Assumed eaten');
  });

  it('notes where it came from and whether it was kept out of the statistics', () => {
    expect(historyNotes(h({ source: 'app' }))).toEqual([]);
    expect(historyNotes(h({ source: 'claude', untracked: true }))).toEqual(['via Claude', 'not in statistics']);
    expect(historyNotes(h({ source: 'check' }))).toEqual(['weekly check']);
  });
});
