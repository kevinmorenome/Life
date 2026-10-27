import { describe, expect, it, vi } from 'vitest';
import { processReceipt, type EmailDeps } from './email';
import { extractItems, imageUrls, isAllowedSender, parseExtraction, receiptText } from './receipt';

describe('isAllowedSender', () => {
  it('matches addresses and @domains, ignoring case', () => {
    expect(isAllowedSender('Me@Example.com', 'me@example.com')).toBe(true);
    expect(isAllowedSender('a@shop.com', '@shop.com, me@example.com')).toBe(true);
    expect(isAllowedSender('evil@notshop.com', '@shop.com')).toBe(false);
  });
  it('allows nobody when unconfigured', () => {
    expect(isAllowedSender('me@example.com', undefined)).toBe(false);
    expect(isAllowedSender('me@example.com', '')).toBe(false);
  });
});

describe('receiptText', () => {
  it('prefers the text part and falls back to flattened HTML', () => {
    expect(receiptText({ text: ' Hello ', html: '<p>x</p>' })).toBe('Hello');
    expect(receiptText({ html: '<style>p{}</style><p>Polo &amp; shorts</p><p>€20</p>' })).toBe('Polo & shorts\n €20');
  });
  it('caps the length', () => {
    expect(receiptText({ text: 'a'.repeat(50_000) }).length).toBe(20_000);
  });
});

it('imageUrls keeps only https images, deduplicated', () => {
  const html = '<img src="https://a.com/1.jpg"><img src="http://a.com/2.jpg"><img src=\'https://a.com/1.jpg\'>';
  expect(imageUrls(html)).toEqual(['https://a.com/1.jpg']);
});

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

describe('extractItems', () => {
  it('sends the key and parses the tool call', async () => {
    const doFetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'tool_use', input: { items: [{ name: 'Tee', category: 'tops' }] } }] })));
    const items = await extractItems({ text: 'Tee €10', images: [], date: '2026-10-01' }, 'key', 'm', doFetch as unknown as typeof fetch);
    expect(items).toEqual([expect.objectContaining({ name: 'Tee', category: 'tops', purchaseDate: '2026-10-01' })]);
    const init = (doFetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('key');
  });
  it('throws when the API fails', async () => {
    const doFetch = async () => new Response('no', { status: 500 });
    await expect(extractItems({ text: 't', images: [], date: '2026-10-01' }, 'k', 'm', doFetch as unknown as typeof fetch)).rejects.toThrow('500');
  });
});

describe('processReceipt', () => {
  const env = { RECEIPT_SENDERS: 'me@example.com' };
  const mail = { from: 'me@example.com', rawSize: 1000, subject: 'Your order', date: '2026-10-05T10:00:00Z', text: 'Tee €10' };
  const make = (items = [{ name: 'Tee', category: 'tops' }]) => {
    const put = vi.fn(async () => {});
    const extract = vi.fn(async () => items);
    const deps: EmailDeps = { store: { put }, extract, now: new Date('2026-10-06T00:00:00Z'), newId: () => 'd1' };
    return { put, extract, deps };
  };

  it('saves a draft for an allowed sender', async () => {
    const { put, extract, deps } = make();
    expect(await processReceipt(mail, env, deps)).toBe('drafted');
    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-05' }));
    expect(put).toHaveBeenCalledWith('inbox', 'd1', expect.objectContaining({ type: 'receipt-draft', subject: 'Your order', items: [{ name: 'Tee', category: 'tops' }] }));
  });
  it('drops other senders, oversized mail and read-only deployments without calling the API', async () => {
    for (const [m, e] of [
      [{ ...mail, from: 'x@evil.com' }, env],
      [{ ...mail, rawSize: 5_000_000 }, env],
      [mail, { ...env, READ_ONLY: 'true' }],
    ] as const) {
      const { put, extract, deps } = make();
      expect(await processReceipt(m, e, deps)).toBe('rejected');
      expect(extract).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
    }
  });
  it('saves nothing when no clothes are found', async () => {
    const { put, deps } = make([]);
    expect(await processReceipt(mail, env, deps)).toBe('empty');
    expect(put).not.toHaveBeenCalled();
  });
});
