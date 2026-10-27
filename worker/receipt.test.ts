import { describe, expect, it } from 'vitest';
import { parseExtraction } from './receipt';

describe('parseExtraction', () => {
  it('validates untrusted model output', () => {
    const items = parseExtraction(
      {
        items: [
          { name: ' Polo ', category: 'tops', colors: ['Navy', 'Neon', 'Navy'], price: 19.999, purchaseDate: '2026-02-30', imageUrl: 'https://x.com/a.jpg' },
          { name: 'Odd', category: 'spaceship', imageUrl: 'https://evil.com/track.png' },
          { category: 'tops' },
          'junk',
        ],
      },
      '2026-10-01',
      ['https://x.com/a.jpg'],
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'Polo', category: 'tops', colors: ['Navy'], price: 20, purchaseDate: '2026-10-01', imageUrl: 'https://x.com/a.jpg' });
    expect(items[1]).toMatchObject({ name: 'Odd', category: 'other', imageUrl: undefined });
  });
  it('returns nothing for malformed output', () => {
    expect(parseExtraction(null, '2026-10-01', [])).toEqual([]);
    expect(parseExtraction({ items: 'no' }, '2026-10-01', [])).toEqual([]);
  });
});
