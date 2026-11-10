import { describe, expect, it } from 'vitest';
import { buildDigest } from './digest';
import { digestLines } from './digestLines';

const empty = { checkins: [], worn: new Map(), days: new Map(), start: '2026-10-19', end: '2026-10-25' };

describe('digestLines', () => {
  it('has no lines for a quiet week', () => {
    expect(digestLines(buildDigest(empty))).toEqual([]);
  });

  it('has one line per part of life that has something', () => {
    const d = buildDigest({
      ...empty,
      checkins: [{ id: 'a', venue: 'Cafe', date: '2026-10-20', time: '09:00', source: 'swarm' }],
      worn: new Map([['2026-10-20', { outfits: ['Work look'], items: [] }]]),
      watched: [{ date: '2026-10-21', title: 'Heat', kind: 'movie' }],
      games: [{ date: '2026-10-22', game: 'Catan' }],
    });
    const lines = digestLines(d);
    expect(lines.map((l) => l.key)).toEqual(['places', 'outfits', 'watching', 'games']);
    expect(lines[0].text).toBe('1 check-in at 1 place, 1 new (0 the week before)');
    expect(lines[1].text).toBe('Logged 1 of 7 days, most worn: Work look');
    expect(lines[3].text).toBe('1 game on 1 day · Catan');
  });
});
