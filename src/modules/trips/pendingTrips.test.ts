import { describe, expect, it } from 'vitest';
import { confirmedStay, isUnconfirmedTrip, pendingOnDate } from './pendingTrips';
import type { Trip } from './types';

const trip = (id: string, startDate: string, endDate: string): Trip => ({ id, name: id, startDate, endDate, itemIds: [], extras: [], packed: [], createdAt: '', updatedAt: '' });

describe('pendingOnDate', () => {
  const suggestion = { ...trip('trip-s1', '2026-05-01', '2026-05-05'), swarmRef: 's1' };
  const stay = trip('stay-MX-2026-05-02', '2026-05-02', '2026-05-04');
  const lone = trip('stay-IT-2026-06-01', '2026-06-01', '2026-06-02');
  const mine = trip('mine', '2026-07-01', '2026-07-03');
  it('lists a suggestion once, not also the stay drawn for the same days', () => {
    expect(pendingOnDate('2026-05-03', [suggestion], [stay, mine]).map((t) => t.id)).toEqual(['trip-s1']);
  });
  it('lists a drawn stay with no suggestion, and never a trip of yours', () => {
    expect(pendingOnDate('2026-06-01', [suggestion], [stay, lone, mine]).map((t) => t.id)).toEqual(['stay-IT-2026-06-01']);
    expect(pendingOnDate('2026-07-02', [suggestion], [stay, lone, mine])).toEqual([]);
  });
  it('knows an unconfirmed trip by its id, and a confirmed stay is not one', () => {
    expect(isUnconfirmedTrip(stay)).toBe(true);
    expect(isUnconfirmedTrip(confirmedStay(stay, 'now'))).toBe(false);
  });
});
