import { describe, expect, it } from 'vitest';
import { MAX_PHOTO_BYTES, fetchPhoto, parseReceiptLines } from './receipt';

describe('parseReceiptLines', () => {
  it('validates untrusted model output', () => {
    const [polo, odd] = parseReceiptLines(
      [
        { name: ' Polo ', category: 'tops', colors: ['Navy', 'Neon', 'Navy'], price: 19.999, purchaseDate: '2026-02-30', seasons: ['summer', 'x'], imageUrl: 'https://x.com/a.jpg' },
        { name: 'Odd', category: 'spaceship', price: -3, imageUrl: 'javascript:alert(1)' },
        { category: 'tops' },
        'junk',
      ],
      '2026-10-01',
    );
    expect(polo).toMatchObject({ name: 'Polo', category: 'tops', colors: ['Navy'], price: 20, purchaseDate: '2026-10-01', seasons: ['summer'], imageUrl: 'https://x.com/a.jpg' });
    expect(odd).toMatchObject({ name: 'Odd', category: 'other', price: undefined, imageUrl: undefined });
  });
  it('returns nothing for malformed input', () => {
    expect(parseReceiptLines(null, '2026-10-01')).toEqual([]);
    expect(parseReceiptLines('no', '2026-10-01')).toEqual([]);
  });
});

describe('fetchPhoto', () => {
  const image = (bytes: number, type = 'image/jpeg', status = 200) =>
    (async () => new Response(new Uint8Array(bytes).fill(65), { status, headers: { 'content-type': type } })) as unknown as typeof fetch;

  it('returns a data URL for a small image', async () => {
    expect(await fetchPhoto('https://x.com/a.jpg', image(3))).toBe('data:image/jpeg;base64,QUFB');
  });
  it('skips oversized, non-image, failed and errored downloads', async () => {
    expect(await fetchPhoto('https://x.com/a.jpg', image(MAX_PHOTO_BYTES + 1))).toBeUndefined();
    expect(await fetchPhoto('https://x.com/a.jpg', image(3, 'text/html'))).toBeUndefined();
    expect(await fetchPhoto('https://x.com/a.jpg', image(3, 'image/svg+xml'))).toBeUndefined();
    expect(await fetchPhoto('https://x.com/a.jpg', image(3, 'image/jpeg', 404))).toBeUndefined();
    expect(await fetchPhoto('https://x.com/a.jpg', (async () => { throw new Error('boom'); }) as unknown as typeof fetch)).toBeUndefined();
  });
});
