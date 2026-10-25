import { describe, expect, it } from 'vitest';
import { handleMcp, mcpAuthorized } from './mcp';
import type { ToolContext } from './mcpTools';
import type { RecordStore, Row } from './records';

type StoreName = 'clothes' | 'outfits' | 'inbox';

function fakeStore(seed: Partial<Record<StoreName, Row[]>> = {}) {
  const data: Record<StoreName, Map<string, Row>> = { clothes: new Map(), outfits: new Map(), inbox: new Map() };
  for (const [name, rows] of Object.entries(seed)) for (const r of rows) data[name as StoreName].set(r.id, r);
  const store: RecordStore = {
    list: async (s) => [...data[s].values()],
    put: async (s, id, record) => void data[s].set(id, { id, ...record }),
    photos: async (ids) =>
      new Map(ids.flatMap((id) => (typeof data.clothes.get(id)?.photo === 'string' ? [[id, data.clothes.get(id)!.photo as string] as const] : []))),
  };
  return { data, store };
}

const ITEMS: Row[] = [
  { id: 'blazer', name: 'Navy blazer', category: 'outerwear', brand: 'Zara', color: 'Navy', status: 'active', wears: ['2026-10-20'] },
  { id: 'tee', name: 'White tee', category: 'tops', status: 'active', wears: ['2026-10-20'], priorWears: 3 },
  { id: 'old', name: 'Old navy cardigan', category: 'tops', status: 'donated', wears: [] },
];
const OUTFITS: Row[] = [{ id: 'work', name: 'Work look', itemIds: ['blazer', 'tee'], wears: ['2026-10-20'] }];

function setup(overrides: Partial<ToolContext> = {}, seed = { clothes: ITEMS, outfits: OUTFITS }) {
  const { data, store } = fakeStore(seed);
  let n = 0;
  const ctx: ToolContext = { store, readOnly: false, now: new Date('2026-10-25T12:00:00Z'), newId: () => `id-${++n}`, ...overrides };
  return { data, ctx };
}

async function rpc(ctx: ToolContext, method: string, params?: object, notification = false) {
  const res = await handleMcp(
    new Request('https://x/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: 1 }), method, params }) }),
    ctx,
  );
  return res.status === 202 ? null : ((await res.json()) as any);
}

async function call(ctx: ToolContext, name: string, args: object) {
  const r = await rpc(ctx, 'tools/call', { name, arguments: args });
  const text: string = r.result.content[0].text;
  const content: { type: string; text?: string; data?: string; mimeType?: string }[] = r.result.content;
  return { isError: r.result.isError as boolean, text, content, json: () => JSON.parse(text) };
}

describe('mcpAuthorized', () => {
  const token = 'a'.repeat(32);
  const req = (headers: HeadersInit = {}) => new Request('https://x/mcp', { headers });

  it('is disabled until a long enough token is set', async () => {
    expect(await mcpAuthorized(req(), '/mcp', {})).toBe('unconfigured');
    expect(await mcpAuthorized(req(), '/mcp', { MCP_TOKEN: 'short' })).toBe('unconfigured');
  });

  it('accepts the token as a bearer header or as the path', async () => {
    const env = { MCP_TOKEN: token };
    expect(await mcpAuthorized(req({ Authorization: `Bearer ${token}` }), '/mcp', env)).toBe('ok');
    expect(await mcpAuthorized(req(), `/mcp/${token}`, env)).toBe('ok');
  });

  it('rejects missing or wrong tokens', async () => {
    const env = { MCP_TOKEN: token };
    expect(await mcpAuthorized(req(), '/mcp', env)).toBe('denied');
    expect(await mcpAuthorized(req({ Authorization: 'Bearer nope' }), '/mcp', env)).toBe('denied');
    expect(await mcpAuthorized(req(), '/mcp/nope', env)).toBe('denied');
  });
});

describe('protocol', () => {
  it('initializes with the requested version and advertises tools', async () => {
    const { ctx } = setup();
    const r = await rpc(ctx, 'initialize', { protocolVersion: '2025-03-26' });
    expect(r.result.protocolVersion).toBe('2025-03-26');
    expect(r.result.capabilities.tools).toBeDefined();
  });

  it('lists the tools, ignores notifications and rejects unknown methods', async () => {
    const { ctx } = setup();
    const list = await rpc(ctx, 'tools/list');
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual([
      'find_items',
      'list_outfits',
      'show_photos',
      'get_wear_log',
      'log_wear',
      'add_item',
      'create_outfit',
    ]);
    expect(await rpc(ctx, 'notifications/initialized', undefined, true)).toBeNull();
    expect((await rpc(ctx, 'nope')).error.code).toBe(-32601);
  });

  it('only accepts POST', async () => {
    const { ctx } = setup();
    expect((await handleMcp(new Request('https://x/mcp'), ctx)).status).toBe(405);
  });
});

describe('reads', () => {
  it('finds active items by every word, across fields', async () => {
    const { ctx } = setup();
    expect((await call(ctx, 'find_items', { query: 'navy blazer' })).json().items.map((i: Row) => i.id)).toEqual(['blazer']);
    // The donated cardigan is hidden even though "navy" matches it.
    expect((await call(ctx, 'find_items', { query: 'navy' })).json().items.map((i: Row) => i.id)).toEqual(['blazer']);
    const tee = (await call(ctx, 'find_items', { category: 'tops' })).json().items[0];
    expect(tee).toMatchObject({ id: 'tee', timesWorn: 4, lastWorn: '2026-10-20' });
  });

  it('lists outfits with piece names', async () => {
    const { ctx } = setup();
    const { outfits } = (await call(ctx, 'list_outfits', {})).json();
    expect(outfits[0].pieces.map((p: Row) => p.name)).toEqual(['Navy blazer', 'White tee']);
  });

  it('reports the wear log by day without double-listing outfit pieces, plus queued requests', async () => {
    const { ctx } = setup();
    await call(ctx, 'log_wear', { date: '2026-10-24', itemIds: ['tee'] });
    const log = (await call(ctx, 'get_wear_log', {})).json();
    expect(log.days).toEqual([{ date: '2026-10-20', outfits: ['Work look'], items: [] }]);
    expect(log.queued_not_yet_in_app).toEqual([{ date: '2026-10-24', names: ['White tee'] }]);
  });
});

describe('show_photos', () => {
  const JPEG = 'data:image/jpeg;base64,/9j/AAAA';
  const photoSeed = {
    clothes: [{ ...ITEMS[0], photo: JPEG }, ITEMS[1], { ...ITEMS[2], photo: 'data:text/html;base64,PHNjcmlwdD4=' }],
    outfits: OUTFITS,
  };

  it('returns each photo as an image block after a caption naming the item', async () => {
    const { ctx } = setup({}, photoSeed);
    const r = await call(ctx, 'show_photos', { itemIds: ['blazer', 'tee'] });
    expect(r.isError).toBe(false);
    expect(r.text).toBe('Showing 1 photo. No photo for: White tee.');
    expect(r.content.slice(1)).toEqual([
      { type: 'text', text: 'Navy blazer' },
      { type: 'image', data: '/9j/AAAA', mimeType: 'image/jpeg' },
    ]);
  });

  it('expands an outfit into its pieces, labelled with the outfit, without repeating an item', async () => {
    const { ctx } = setup({}, photoSeed);
    const r = await call(ctx, 'show_photos', { outfitIds: ['work'], itemIds: ['blazer'] });
    expect(r.content.filter((c) => c.type === 'image')).toHaveLength(1);
    expect(r.content[1]).toEqual({ type: 'text', text: 'Navy blazer' }); // the explicit item label wins over the outfit's
    const viaOutfit = await call(ctx, 'show_photos', { outfitIds: ['work'] });
    expect(viaOutfit.content.some((c) => c.text === 'Navy blazer · from “Work look”')).toBe(true);
  });

  it('never forwards non-image data URLs', async () => {
    const { ctx } = setup({}, photoSeed);
    const r = await call(ctx, 'show_photos', { itemIds: ['old'] });
    expect(r.content.filter((c) => c.type === 'image')).toEqual([]);
    expect(r.text).toContain('No photo for: Old navy cardigan');
  });

  it('caps the number of photos and reports the rest', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, category: 'tops', status: 'active', wears: [], photo: JPEG }));
    const { ctx } = setup({}, { clothes: many, outfits: [] });
    const r = await call(ctx, 'show_photos', { itemIds: many.map((m) => m.id) });
    expect(r.content.filter((c) => c.type === 'image')).toHaveLength(8);
    expect(r.text).toContain('4 more not shown');
  });

  it('rejects unknown ids and empty requests', async () => {
    const { ctx } = setup({}, photoSeed);
    expect((await call(ctx, 'show_photos', { itemIds: ['ghost'] })).isError).toBe(true);
    expect((await call(ctx, 'show_photos', { outfitIds: ['ghost'] })).isError).toBe(true);
    expect((await call(ctx, 'show_photos', {})).isError).toBe(true);
  });

  it('works on read-only deployments', async () => {
    const { ctx } = setup({ readOnly: true }, photoSeed);
    expect((await call(ctx, 'show_photos', { itemIds: ['blazer'] })).isError).toBe(false);
  });
});

describe('log_wear', () => {
  it('queues an inbox entry for the app to apply', async () => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'log_wear', { date: '2026-10-25', outfitIds: ['work'], itemIds: ['tee'] });
    expect(r.isError).toBe(false);
    expect(data.inbox.get('id-1')).toMatchObject({
      type: 'wear',
      date: '2026-10-25',
      outfitIds: ['work'],
      itemIds: ['tee'],
      source: 'claude',
    });
    expect(data.inbox.get('id-1')).not.toHaveProperty('appliedAt');
    // The wardrobe itself is never edited by the server.
    expect(data.clothes.get('tee')!.wears).toEqual(['2026-10-20']);
  });

  it('does not queue the same request twice while it is pending', async () => {
    const { ctx, data } = setup();
    await call(ctx, 'log_wear', { date: '2026-10-25', itemIds: ['tee', 'blazer'] });
    const again = await call(ctx, 'log_wear', { date: '2026-10-25', itemIds: ['blazer', 'tee'] });
    expect(again.text).toContain('Already queued');
    expect(data.inbox.size).toBe(1);
  });

  it('queues again once the earlier request was applied', async () => {
    const { ctx, data } = setup();
    await call(ctx, 'log_wear', { date: '2026-10-25', itemIds: ['tee'] });
    data.inbox.get('id-1')!.appliedAt = 'x';
    await call(ctx, 'log_wear', { date: '2026-10-25', itemIds: ['tee'] });
    expect(data.inbox.size).toBe(2);
  });

  it.each([
    [{ date: 'yesterday', itemIds: ['tee'] }, 'YYYY-MM-DD'],
    [{ date: '2026-02-31', itemIds: ['tee'] }, 'YYYY-MM-DD'],
    [{ date: '2026-12-01', itemIds: ['tee'] }, 'future'],
    [{ date: '2026-10-25' }, 'at least one'],
    [{ date: '2026-10-25', itemIds: ['ghost'] }, 'Unknown ids: ghost'],
    [{ date: '2026-10-25', outfitIds: ['tee'] }, 'Unknown ids: tee'],
  ])('rejects %j', async (args, message) => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'log_wear', args);
    expect(r.isError).toBe(true);
    expect(r.text).toContain(message);
    expect(data.inbox.size).toBe(0);
  });

  it('allows tomorrow for users ahead of UTC', async () => {
    const { ctx } = setup();
    expect((await call(ctx, 'log_wear', { date: '2026-10-26', itemIds: ['tee'] })).isError).toBe(false);
  });
});

describe('add_item and create_outfit', () => {
  it('adds an active item with the fields the app expects', async () => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'add_item', { name: ' Grey jeans ', category: 'bottoms', price: 59.9, seasons: ['fall', 'bogus'], tags: ['denim', ' '] });
    expect(r.json().added).toEqual({ id: 'id-1', name: 'Grey jeans' });
    expect(data.clothes.get('id-1')).toMatchObject({
      name: 'Grey jeans',
      category: 'bottoms',
      price: 59.9,
      seasons: ['fall'],
      tags: ['denim'],
      status: 'active',
      wears: [],
    });
  });

  it('validates item input', async () => {
    const { ctx } = setup();
    expect((await call(ctx, 'add_item', { name: 'x', category: 'hats' })).isError).toBe(true);
    expect((await call(ctx, 'add_item', { name: '  ', category: 'tops' })).isError).toBe(true);
    expect((await call(ctx, 'add_item', { name: 'x', category: 'tops', price: -1 })).isError).toBe(true);
  });

  it('creates an outfit from existing items only', async () => {
    const { ctx, data } = setup();
    expect((await call(ctx, 'create_outfit', { itemIds: ['blazer', 'ghost'] })).isError).toBe(true);
    const r = await call(ctx, 'create_outfit', { name: 'Smart', itemIds: ['blazer', 'tee', 'tee'] });
    expect(r.isError).toBe(false);
    expect(data.outfits.get('id-1')).toMatchObject({ name: 'Smart', itemIds: ['blazer', 'tee'], wears: [] });
  });
});

describe('read-only deployments', () => {
  it('still read, but refuse every write', async () => {
    const { ctx, data } = setup({ readOnly: true });
    expect((await call(ctx, 'find_items', {})).isError).toBe(false);
    for (const [name, args] of [
      ['log_wear', { date: '2026-10-25', itemIds: ['tee'] }],
      ['add_item', { name: 'x', category: 'tops' }],
      ['create_outfit', { itemIds: ['tee'] }],
    ] as const) {
      expect((await call(ctx, name, args)).isError).toBe(true);
    }
    expect(data.inbox.size + data.clothes.size + data.outfits.size).toBe(ITEMS.length + OUTFITS.length);
  });
});
