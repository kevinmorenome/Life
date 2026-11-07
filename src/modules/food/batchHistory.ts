import type { HistoryEntry } from './stock';

/** "Used 0.3 kg", "Put 0.6 kg in the freezer": one line of a batch's history. `amount` writes a quantity with its unit. */
export function historyText(h: HistoryEntry, amount: (q: number) => string): string {
  const q = h.quantity === undefined ? '' : amount(Math.abs(h.quantity));
  switch (h.kind) {
    case 'bought':
      return `Bought ${q}`;
    case 'counted':
      return `Counted: ${q}`;
    case 'used':
      return `Used ${q}`;
    case 'tossed':
      return `Threw out ${q}`;
    case 'finished':
      return 'Finished';
    case 'adjusted':
      return `Counted down by ${q}`;
    case 'moved-out':
      return h.to === 'freezer' ? `Put ${q} in the freezer` : `Took ${q} out of the freezer`;
    case 'frozen':
      return `Frozen: ${q}`;
    case 'thawed':
      return `Thawed: ${q}`;
    case 'confirmed':
      return `Still have: ${q}`;
    case 'expiry':
      return 'Use-by date set';
    case 'assumed-eaten':
      return 'Assumed eaten';
  }
}

/** Where a line came from, when it isn't plainly you in the app: "via Claude", "weekly check", "not in statistics". */
export function historyNotes(h: HistoryEntry): string[] {
  return [h.source === 'claude' ? 'via Claude' : h.source === 'check' ? 'weekly check' : '', h.untracked ? 'not in statistics' : ''].filter(Boolean);
}
