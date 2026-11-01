import { describe, expect, it } from 'vitest';
import { handleMcp, mcpAuthorized } from './mcp';
import type { ToolContext } from './mcpTools';
import type { RecordStore, Row } from './records';

type StoreName = 'clothes' | 'outfits' | 'inbox' | 'foodreceipts' | 'foodproducts';

function fakeStore(seed: Partial<Record<StoreName, Row[]>> = {}) {
  const data: Record<StoreName, Map<string, Row>> = { clothes: new Map(), outfits: new Map(), inbox: new Map(), foodreceipts: new Map(), foodproducts: new Map() };
  for (const [name, rows] of Object.entries(seed)) for (const r of rows) data[name as StoreName].set(r.id, r);
  const store: RecordStore = {
    list: async (s) => [...data[s].values()],
    put: async (s, id, record) => void data[s as StoreName].set(id, { id, ...record }),
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
  const ctx: ToolContext = { store, readOnly: false, now: new Date('2026-10-25T12:00:00Z'), newId: () => `id-${++n}`, appUrl: 'https://life.test', ...overrides };
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
  const structured = r.result.structuredContent as { photos: { caption: string; mimeType: string; data: string }[]; note: string } | undefined;
  return { isError: r.result.isError as boolean, text, content, structured, json: () => JSON.parse(text) };
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
      'add_tags',
      'add_item',
      'add_receipt_items',
      'add_grocery_receipt',
      'create_outfit',
      'edit_outfit',
      'edit_item',
      'set_item_photo',
    ]);
    expect(await rpc(ctx, 'notifications/initialized', undefined, true)).toBeNull();
    expect((await rpc(ctx, 'nope')).error.code).toBe(-32601);
  });

  it('only accepts POST', async () => {
    const { ctx } = setup();
    expect((await handleMcp(new Request('https://x/mcp'), ctx)).status).toBe(405);
  });
});

describe('photo gallery (MCP App)', () => {
  it('points show_photos at a ui:// resource and advertises resources', async () => {
    const { ctx } = setup();
    expect((await rpc(ctx, 'initialize', { protocolVersion: '2025-06-18' })).result.capabilities.resources).toBeDefined();
    const tool = (await rpc(ctx, 'tools/list')).result.tools.find((t: { name: string }) => t.name === 'show_photos');
    expect(tool._meta.ui.resourceUri).toBe('ui://life/photos');
    expect(tool._meta['ui/resourceUri']).toBe('ui://life/photos');
  });

  it('serves the gallery page as an MCP App resource', async () => {
    const { ctx } = setup();
    const list = await rpc(ctx, 'resources/list');
    expect(list.result.resources).toEqual([expect.objectContaining({ uri: 'ui://life/photos', mimeType: 'text/html;profile=mcp-app' })]);
    const read = await rpc(ctx, 'resources/read', { uri: 'ui://life/photos' });
    const [page] = read.result.contents;
    expect(page.mimeType).toBe('text/html;profile=mcp-app');
    expect(page.text).toContain('ui/initialize');
    // Field names the host validates (ext-apps McpUiInitializeRequest); the spec's prose names others.
    expect(page.text).toContain('appInfo');
    expect(page.text).toContain('appCapabilities');
    expect(page.text).not.toContain('clientInfo');
    expect(page.text).toContain('ui/notifications/tool-result');
    expect(page.text).toContain('structuredContent');
    // Self-contained: the host's default CSP blocks anything fetched from elsewhere.
    expect(page.text).not.toMatch(/https?:\/\//);
    expect((await rpc(ctx, 'resources/read', { uri: 'ui://life/other' })).error.code).toBe(-32002);
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
    expect(r.text).toBe(
      'Showing 1 photo. No photo for: White tee.\nOpen in the app:\nNavy blazer: https://life.test/#/clothes/blazer\nWhite tee: https://life.test/#/clothes/tee',
    );
    expect(r.content.slice(1)).toEqual([
      { type: 'text', text: 'Navy blazer' },
      { type: 'image', data: '/9j/AAAA', mimeType: 'image/jpeg' },
    ]);
  });

  it('links outfits and items back into the app', async () => {
    const { ctx } = setup({}, photoSeed);
    const r = await call(ctx, 'show_photos', { outfitIds: ['work'] });
    expect(r.text).toContain('Work look: https://life.test/#/clothes/outfits/work');
    expect(r.text).toContain('Navy blazer: https://life.test/#/clothes/blazer');
  });

  it('also hands the photos to the gallery view as structured content, which hosts keep out of the model', async () => {
    const { ctx } = setup({}, photoSeed);
    const r = await call(ctx, 'show_photos', { itemIds: ['blazer', 'tee'] });
    expect(r.structured).toEqual({
      photos: [{ caption: 'Navy blazer', mimeType: 'image/jpeg', data: '/9j/AAAA' }],
      note: 'No photo for: White tee.',
    });
    expect((await call(ctx, 'find_items', {})).structured).toBeUndefined();
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

describe('log_wear saves outfits', () => {
  const closet: Row[] = [
    { id: 'blazer', name: 'Navy blazer', category: 'outerwear', status: 'active', wears: [] },
    { id: 'tee', name: 'White tee', category: 'tops', status: 'active', wears: [] },
    { id: 'shoes', name: 'White sneakers', category: 'shoes', status: 'active', wears: [] },
    { id: 'sweats', name: 'Sweatpants', category: 'bottoms', status: 'active', wears: [] },
  ];
  const work: Row = { id: 'work', name: 'Work look', itemIds: ['blazer', 'tee'], wears: [] };
  const log = (ctx: ToolContext, args: object) => call(ctx, 'log_wear', { date: '2026-10-25', ...args });

  it('saves two or more loose pieces as a new outfit and logs that outfit', async () => {
    const { ctx, data } = setup({}, { clothes: closet, outfits: [] });
    const r = await log(ctx, { itemIds: ['sweats', 'tee'], outfitName: 'Lazy Sunday' });
    expect(r.text).toContain('new outfit (Lazy Sunday');
    expect(data.outfits.get('id-1')).toMatchObject({ name: 'Lazy Sunday', itemIds: ['sweats', 'tee'], wears: [] });
    expect(data.inbox.get('id-2')).toMatchObject({ outfitIds: ['id-1'], itemIds: [] });
  });

  it('reuses an outfit with exactly the same pieces, in any order', async () => {
    const { ctx, data } = setup({}, { clothes: closet, outfits: [work] });
    await log(ctx, { itemIds: ['tee', 'blazer'] });
    expect(data.outfits.size).toBe(1);
    expect(data.inbox.get('id-1')).toMatchObject({ outfitIds: ['work'], itemIds: [] });
  });

  it('does not create a second outfit when the same request is repeated', async () => {
    const { ctx, data } = setup({}, { clothes: closet, outfits: [] });
    await log(ctx, { itemIds: ['sweats', 'tee'] });
    const again = await log(ctx, { itemIds: ['sweats', 'tee'] });
    expect(again.text).toContain('Already queued');
    expect(data.outfits.size).toBe(1);
    expect(data.inbox.size).toBe(1);
  });

  it('does not create an outfit for a single piece', async () => {
    const { ctx, data } = setup({}, { clothes: closet, outfits: [] });
    await log(ctx, { itemIds: ['sweats'] });
    expect(data.outfits.size).toBe(0);
    expect(data.inbox.get('id-1')).toMatchObject({ itemIds: ['sweats'], outfitIds: [] });
  });

  it('asks before guessing when an existing outfit has more pieces than were mentioned', async () => {
    const withShoes: Row = { id: 'full', name: 'Smart with sneakers', itemIds: ['blazer', 'tee', 'shoes'], wears: [] };
    const { ctx, data } = setup({}, { clothes: closet, outfits: [withShoes] });
    const r = await log(ctx, { itemIds: ['blazer', 'tee'] });
    expect(r.isError).toBe(false);
    expect(r.text).toContain('NOT LOGGED YET');
    const candidates = JSON.parse(r.text.slice(r.text.indexOf('\n[') + 1, r.text.indexOf('\nAsk the user')));
    expect(candidates).toEqual([
      {
        outfitId: 'full',
        name: 'Smart with sneakers',
        pieces: ['Navy blazer', 'White tee', 'White sneakers'],
        alsoInThisOutfit: ['White sneakers'],
        notInThisOutfit: [],
      },
    ]);
    expect(data.outfits.size).toBe(1);
    expect(data.inbox.size).toBe(0);
  });

  it('also asks when the user mentioned more than an existing outfit contains', async () => {
    const { ctx, data } = setup({}, { clothes: closet, outfits: [work] });
    const r = await log(ctx, { itemIds: ['blazer', 'tee', 'shoes'] });
    expect(r.text).toContain('NOT LOGGED YET');
    expect(r.text).toContain('"notInThisOutfit": [\n   "White sneakers"');
    expect(data.inbox.size).toBe(0);
  });

  it('logs the confirmed existing outfit', async () => {
    const { ctx, data } = setup({}, { clothes: closet, outfits: [work] });
    await log(ctx, { outfitIds: ['work'], itemIds: ['shoes'] });
    expect(data.outfits.size).toBe(1);
    expect(data.inbox.get('id-1')).toMatchObject({ outfitIds: ['work'], itemIds: ['shoes'] });
  });

  it('creates a new outfit once the user says the similar one is not it', async () => {
    const { ctx, data } = setup({}, { clothes: closet, outfits: [work] });
    await log(ctx, { itemIds: ['blazer', 'tee', 'shoes'], createNewOutfit: true });
    expect(data.outfits.size).toBe(2);
    expect(data.outfits.get('id-1')!.itemIds).toEqual(['blazer', 'tee', 'shoes']);
  });

  it('creates nothing when the request is invalid or the deployment is read-only', async () => {
    const { ctx, data } = setup({}, { clothes: closet, outfits: [] });
    await log(ctx, { date: 'nope', itemIds: ['sweats', 'tee'] });
    await log(ctx, { itemIds: ['sweats', 'ghost'] });
    const ro = setup({ readOnly: true }, { clothes: closet, outfits: [] });
    await log(ro.ctx, { itemIds: ['sweats', 'tee'] });
    expect(data.outfits.size + data.inbox.size + ro.data.outfits.size + ro.data.inbox.size).toBe(0);
  });
});

describe('add_tags', () => {
  const tagged: Row[] = [
    { id: 'pj', name: 'Pajama set', category: 'sleepwear', status: 'active', wears: [], tags: ['cozy'] },
    { id: 'tee', name: 'White tee', category: 'tops', status: 'active', wears: [] },
  ];
  const lounge: Row = { id: 'lounge', name: 'Lounge', itemIds: ['pj'], wears: [] };

  it('queues a tag request instead of editing the records', async () => {
    const { ctx, data } = setup({}, { clothes: tagged, outfits: [lounge] });
    const r = await call(ctx, 'add_tags', { tags: ['  #Pajamas ', 'Cozy Day', 'pajamas'], itemIds: ['pj'], outfitIds: ['lounge'] });
    expect(r.isError).toBe(false);
    expect(data.inbox.get('id-1')).toMatchObject({
      type: 'tags',
      tags: ['pajamas', 'cozy day'],
      itemIds: ['pj'],
      outfitIds: ['lounge'],
      source: 'claude',
    });
    expect(data.clothes.get('pj')!.tags).toEqual(['cozy']);
    expect(data.outfits.get('lounge')).not.toHaveProperty('tags');
  });

  it('shows existing tags so Claude can reuse them', async () => {
    const { ctx } = setup({}, { clothes: tagged, outfits: [{ ...lounge, tags: ['home'] }] });
    expect((await call(ctx, 'find_items', { query: 'pajama' })).json().items[0].tags).toEqual(['cozy']);
    expect((await call(ctx, 'list_outfits', {})).json().outfits[0].tags).toEqual(['home']);
    expect((await call(ctx, 'find_items', { query: 'tee' })).json().items[0]).not.toHaveProperty('tags');
  });

  it.each([
    [{ tags: [], itemIds: ['tee'] }, 'at least one tag'],
    [{ tags: ['a', 'b', 'c', 'd', 'e', 'f'], itemIds: ['tee'] }, 'At most 5'],
    [{ tags: ['cozy'] }, 'at least one item id'],
    [{ tags: ['cozy'], itemIds: ['ghost'] }, 'Unknown ids: ghost'],
    [{ tags: ['cozy'], outfitIds: ['ghost'] }, 'Unknown ids: ghost'],
  ])('rejects %j', async (args, message) => {
    const { ctx, data } = setup({}, { clothes: tagged, outfits: [lounge] });
    const r = await call(ctx, 'add_tags', args);
    expect(r.isError).toBe(true);
    expect(r.text).toContain(message);
    expect(data.inbox.size).toBe(0);
  });

  it('refuses on read-only deployments', async () => {
    const { ctx, data } = setup({ readOnly: true }, { clothes: tagged, outfits: [lounge] });
    expect((await call(ctx, 'add_tags', { tags: ['cozy'], itemIds: ['tee'] })).isError).toBe(true);
    expect(data.inbox.size).toBe(0);
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

  it('stores colours from the swatch palette as a list', async () => {
    const { ctx, data } = setup();
    await call(ctx, 'add_item', { name: 'Tee', category: 'tops', colors: ['Navy', 'White', 'Navy'] });
    expect(data.clothes.get('id-1')).toMatchObject({ colors: ['Navy', 'White'], color: 'Navy, White' });
  });

  it('validates item input', async () => {
    const { ctx } = setup();
    expect((await call(ctx, 'add_item', { name: 'x', category: 'hats' })).isError).toBe(true);
    expect((await call(ctx, 'add_item', { name: '  ', category: 'tops' })).isError).toBe(true);
    expect((await call(ctx, 'add_item', { name: 'x', category: 'tops', price: -1 })).isError).toBe(true);
    expect((await call(ctx, 'add_item', { name: 'x', category: 'tops', colors: ['Periwinkle'] })).isError).toBe(true);
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
      ['add_grocery_receipt', { sourceId: 'r1', store: 'Konzum', date: '2026-10-31', lines: [{ name: 'Milk', quantity: 1, unitPrice: 1 }] }],
      ['add_receipt_items', { sourceId: 'm1', items: [{ name: 'x', category: 'tops' }] }],
      ['set_item_photo', { itemId: 'tee', imageUrl: 'https://x.com/p.jpg' }],
    ] as const) {
      expect((await call(ctx, name, args)).isError).toBe(true);
    }
    expect(data.inbox.size + data.clothes.size + data.outfits.size).toBe(ITEMS.length + OUTFITS.length);
  });
});

describe('edit_outfit', () => {
  it('queues an edit instead of changing the outfit', async () => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'edit_outfit', { outfitId: 'work', name: 'Smart', removeItemIds: ['tee'], addItemIds: ['old'] });
    expect(r.isError).toBe(false);
    expect(data.inbox.get('id-1')).toMatchObject({ type: 'outfit-edit', outfitIds: ['work'], itemIds: ['old'], removeItemIds: ['tee'], name: 'Smart', source: 'claude' });
    expect(data.outfits.get('work')!.itemIds).toEqual(['blazer', 'tee']);
  });

  it.each([
    [{ outfitId: 'ghost', name: 'x' }, 'Unknown outfit'],
    [{ outfitId: 'work' }, 'new name'],
    [{ outfitId: 'work', addItemIds: ['ghost'] }, 'Unknown item ids'],
    [{ outfitId: 'work', removeItemIds: ['blazer', 'tee'] }, 'at least one piece'],
    [{ outfitId: 'work', addItemIds: ['tee'], removeItemIds: ['tee'] }, 'both added and removed'],
  ])('rejects %j', async (args, message) => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'edit_outfit', args);
    expect(r.isError).toBe(true);
    expect(r.text).toContain(message);
    expect(data.inbox.size).toBe(0);
  });

  it('refuses on read-only deployments', async () => {
    const { ctx, data } = setup({ readOnly: true });
    expect((await call(ctx, 'edit_outfit', { outfitId: 'work', name: 'x' })).isError).toBe(true);
    expect(data.inbox.size).toBe(0);
  });
});

describe('edit_item', () => {
  it('queues the changes instead of editing the item', async () => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'edit_item', { itemId: 'blazer', brand: ' Massimo ', size: null, colors: ['Navy'], status: 'storage' });
    expect(r.isError).toBe(false);
    expect(data.inbox.get('id-1')).toMatchObject({
      type: 'item-edit',
      itemIds: ['blazer'],
      changes: { brand: 'Massimo', size: null, colors: ['Navy'], status: 'storage' },
      source: 'claude',
    });
    expect(data.clothes.get('blazer')!.brand).toBe('Zara');
  });

  it.each([
    [{ itemId: 'ghost', name: 'x' }, 'Unknown item'],
    [{ itemId: 'tee' }, 'at least one field'],
    [{ itemId: 'tee', name: '  ' }, 'can’t be empty'],
    [{ itemId: 'tee', category: 'hats' }, 'category must be'],
    [{ itemId: 'tee', status: 'lost' }, 'status must be'],
    [{ itemId: 'tee', price: -1 }, 'price'],
    [{ itemId: 'tee', purchaseDate: '2026-13-01' }, 'purchaseDate'],
    [{ itemId: 'tee', colors: ['Plaid'] }, 'colors must be'],
    [{ itemId: 'tee', seasons: ['monsoon'] }, 'seasons must be'],
  ])('rejects %j', async (args, message) => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'edit_item', args);
    expect(r.isError).toBe(true);
    expect(r.text).toContain(message);
    expect(data.inbox.size).toBe(0);
  });

  it('refuses on read-only deployments', async () => {
    const { ctx, data } = setup({ readOnly: true });
    expect((await call(ctx, 'edit_item', { itemId: 'tee', name: 'x' })).isError).toBe(true);
    expect(data.inbox.size).toBe(0);
  });
});

describe('add_grocery_receipt', () => {
  const args = {
    sourceId: '7d7f54c0-e10d',
    store: 'Konzum',
    branch: 'Zarka Dolinara 2',
    date: '2026-10-31',
    time: '15:37',
    total: 7.27,
    lines: [
      { name: 'Chicken fillet', rawName: 'FILE OD PRSA K PLU', quantity: 0.48, unit: 'kg', unitPrice: 5.99, discount: 0.67 },
      { name: 'Oat milk 3.5%', quantity: 1, unitPrice: 4.19 },
      { name: 'Deposit', kind: 'deposit', quantity: 2, unitPrice: 0.1 },
    ],
  };

  it('stores the receipt with recomputed line amounts and is idempotent', async () => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'add_grocery_receipt', args);
    expect(r.isError).toBe(false);
    expect(r.json().warning).toBeUndefined();
    expect(data.foodreceipts.get('food-7d7f54c0-e10d')).toMatchObject({
      store: 'Konzum', date: '2026-10-31', time: '15:37', total: 7.27,
      lines: [{ paid: 2.88, unit: 'kg', kind: 'food', discount: 0.67 }, { paid: 4.19 }, { kind: 'deposit', paid: 0.2 }],
    });
    data.foodreceipts.set('food-7d7f54c0-e10d', { ...data.foodreceipts.get('food-7d7f54c0-e10d')!, store: 'My edit' });
    expect((await call(ctx, 'add_grocery_receipt', args)).json()).toEqual({ alreadyAdded: true });
    expect(data.foodreceipts.get('food-7d7f54c0-e10d')).toMatchObject({ store: 'My edit' });
  });

  it('creates a product per stocked line, using Claude\'s hints, and none for bags or deposits', async () => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'add_grocery_receipt', {
      sourceId: 'p1', store: 'Konzum', date: '2026-10-31',
      lines: [
        { name: 'Chicken fillet', quantity: 0.5, unit: 'kg', unitPrice: 6, productType: 'fresh', storage: 'fridge', shelfLifeDays: 2 },
        { name: 'Beer', kind: 'alcohol', quantity: 1, unitPrice: 2, productType: 'bogus', storage: 'attic', shelfLifeDays: -3 },
        { name: 'Bag', kind: 'bag', quantity: 1, unitPrice: 0.2 },
      ],
    });
    expect(r.json().newProducts).toEqual(['Chicken fillet', 'Beer']);
    expect(data.foodproducts.get('fp-chicken-fillet')).toMatchObject({ name: 'Chicken fillet', type: 'fresh', storage: 'fridge', shelfLifeDays: 2 });
    expect(data.foodproducts.get('fp-beer')).toMatchObject({ type: 'drink', storage: 'pantry' });
    expect(data.foodproducts.get('fp-beer')!.shelfLifeDays).toBeUndefined();
    expect(data.foodproducts.size).toBe(2);
  });

  it('never edits an existing product and reuses the name given to the same printed text', async () => {
    const { ctx, data } = setup();
    const line = { name: 'Oat drink 3.5%', rawName: 'NAP ZOB 3,5% MA NO M', quantity: 1, unitPrice: 4.19, productType: 'staple', storage: 'pantry' };
    await call(ctx, 'add_grocery_receipt', { sourceId: 'a', store: 'Konzum', date: '2026-10-01', lines: [line] });
    data.foodproducts.set('fp-oat-drink-3-5', { ...data.foodproducts.get('fp-oat-drink-3-5')!, storage: 'fridge' });

    const again = await call(ctx, 'add_grocery_receipt', { sourceId: 'b', store: 'Konzum', date: '2026-10-15', lines: [{ ...line, name: 'Oat milk', storage: 'freezer' }] });
    expect(again.json().matchedToKnownProducts).toEqual([{ from: 'Oat milk', to: 'Oat drink 3.5%' }]);
    expect(again.json().newProducts).toBeUndefined();
    expect((data.foodreceipts.get('food-b')!.lines as { name: string }[])[0].name).toBe('Oat drink 3.5%');
    expect(data.foodproducts.get('fp-oat-drink-3-5')).toMatchObject({ storage: 'fridge' });
    expect(data.foodproducts.size).toBe(1);
  });

  it('warns when the printed total does not match the lines', async () => {
    const { ctx } = setup();
    const r = await call(ctx, 'add_grocery_receipt', { ...args, sourceId: 'r2', total: 50 });
    expect(r.json().warning).toMatch(/does not match/);
  });

  it('refuses a receipt without a store or valid lines', async () => {
    const { ctx } = setup();
    expect((await call(ctx, 'add_grocery_receipt', { ...args, store: '' })).isError).toBe(true);
    expect((await call(ctx, 'add_grocery_receipt', { ...args, lines: [{ name: '' }] })).isError).toBe(true);
  });
});

describe('add_receipt_items', () => {
  const photo = 'data:image/jpeg;base64,AAAA';
  const withPhotos = (urls: string[] = []) => ({ fetchPhoto: async (url: string) => (urls.includes(url) ? photo : undefined) });

  it('adds flagged items with the details and photo from the email', async () => {
    const { ctx, data } = setup(withPhotos(['https://x.com/p.jpg']));
    const r = await call(ctx, 'add_receipt_items', {
      sourceId: 'msg/1',
      items: [
        { name: 'Polo', category: 'tops', brand: 'Lacoste', colors: ['Navy', 'Neon'], size: 'M', material: 'Cotton', price: 80, purchaseDate: '2026-10-01', seasons: ['summer', 'bogus'], notes: 'Order 42', imageUrl: 'https://x.com/p.jpg' },
        { name: 'Odd', category: 'spaceship', imageUrl: 'http://insecure.com/p.jpg' },
      ],
    });
    expect(r.isError).toBe(false);
    expect(data.clothes.get('receipt-msg1-0')).toMatchObject({
      name: 'Polo', category: 'tops', brand: 'Lacoste', colors: ['Navy'], color: 'Navy', size: 'M', material: 'Cotton', price: 80,
      purchaseDate: '2026-10-01', seasons: ['summer'], notes: 'Order 42', photo, status: 'active', needsReview: true, wears: [],
    });
    expect(data.clothes.get('receipt-msg1-1')).toMatchObject({ category: 'other', purchaseDate: '2026-10-25', needsReview: true });
    expect(data.clothes.get('receipt-msg1-1')!.photo).toBeUndefined();
    expect(r.json().added).toHaveLength(2);
  });

  it('is idempotent and never overwrites an edited item', async () => {
    const { ctx, data } = setup(withPhotos());
    const args = { sourceId: 'm1', items: [{ name: 'Tee', category: 'tops' }] };
    await call(ctx, 'add_receipt_items', args);
    data.clothes.set('receipt-m1-0', { ...data.clothes.get('receipt-m1-0')!, name: 'My edit', needsReview: undefined });
    const again = await call(ctx, 'add_receipt_items', args);
    expect(again.json()).toEqual({ alreadyAdded: true });
    expect(data.clothes.get('receipt-m1-0')).toMatchObject({ name: 'My edit' });
  });

  it('rejects calls without a source id or valid items', async () => {
    const { ctx, data } = setup();
    expect((await call(ctx, 'add_receipt_items', { items: [{ name: 'x', category: 'tops' }] })).isError).toBe(true);
    expect((await call(ctx, 'add_receipt_items', { sourceId: 'm1', items: [{ category: 'tops' }] })).isError).toBe(true);
    expect(data.clothes.size).toBe(ITEMS.length);
  });
});

describe('guards against splitting an item\'s history', () => {
  const photo = 'data:image/jpeg;base64,AAAA';
  const fetcher = { fetchPhoto: async (url: string) => (url.includes('good') ? photo : undefined) };

  it('add_item refuses a second item with the same name and points to the existing one', async () => {
    const { ctx, data } = setup(fetcher);
    const r = await call(ctx, 'add_item', { name: ' navy  BLAZER ', category: 'outerwear', brand: 'Zara' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/id blazer/);
    expect(r.text).toMatch(/set_item_photo/);
    expect(data.clothes.size).toBe(ITEMS.length);
    // an explicit confirmation, or a different brand, goes through; retired items don't count
    expect((await call(ctx, 'add_item', { name: 'Navy blazer', category: 'outerwear', allowDuplicate: true })).isError).toBe(false);
    expect((await call(ctx, 'add_item', { name: 'Old navy cardigan', category: 'tops' })).isError).toBe(false);
  });

  it('add_item can attach a downloaded photo', async () => {
    const { ctx, data } = setup(fetcher);
    const r = await call(ctx, 'add_item', { name: 'Green cap', category: 'accessories', imageUrl: 'https://x.com/good.jpg' });
    expect(r.json().added.photo).toBe(true);
    expect(data.clothes.get('id-1')!.photo).toBe(photo);
    const bad = await call(ctx, 'add_item', { name: 'Red cap', category: 'accessories', imageUrl: 'https://x.com/bad.jpg' });
    expect(bad.json().added.photo).toBe(false);
    expect(bad.json().added.photoNote).toMatch(/Could not download/);
  });

  it('add_receipt_items skips lines that already exist instead of creating a second item', async () => {
    const { ctx, data } = setup(fetcher);
    const r = await call(ctx, 'add_receipt_items', {
      sourceId: 'm9',
      items: [
        { name: 'White Tee', category: 'tops' },
        { name: 'Linen shirt', category: 'tops', imageUrl: 'https://x.com/bad.jpg' },
      ],
    });
    const out = r.json();
    expect(out.skippedAsExisting).toEqual([{ line: 'White Tee', existingItemId: 'tee', existingName: 'White tee' }]);
    expect(out.added.map((a: { name: string }) => a.name)).toEqual(['Linen shirt']);
    expect(out.added[0].photoNote).toMatch(/Could not download/);
    expect(data.clothes.has('receipt-m9-0')).toBe(false);
    expect(data.clothes.get('receipt-m9-1')).toMatchObject({ needsReview: true });
    // a confirmed second purchase is allowed
    const again = await call(ctx, 'add_receipt_items', { sourceId: 'm10', allowDuplicates: true, items: [{ name: 'White tee', category: 'tops' }] });
    expect(again.json().added).toHaveLength(1);
  });

  it('set_item_photo queues the photo for the app instead of touching the item', async () => {
    const { ctx, data } = setup(fetcher);
    const r = await call(ctx, 'set_item_photo', { itemId: 'tee', imageUrl: 'https://x.com/good.jpg' });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/queued, not already attached/);
    expect(data.inbox.get('id-1')).toMatchObject({ type: 'photo', itemIds: ['tee'], photo, source: 'claude' });
    expect(data.clothes.get('tee')!.photo).toBeUndefined();
    expect((await call(ctx, 'set_item_photo', { itemId: 'nope', imageUrl: 'https://x.com/good.jpg' })).isError).toBe(true);
    expect((await call(ctx, 'set_item_photo', { itemId: 'tee', imageUrl: 'http://x.com/good.jpg' })).isError).toBe(true);
    expect((await call(ctx, 'set_item_photo', { itemId: 'tee', imageUrl: 'https://x.com/bad.jpg' })).text).toMatch(/Could not download/);
    expect(data.inbox.size).toBe(1);
  });

  it('edit_item only retires an item when the user confirmed it', async () => {
    const { ctx, data } = setup();
    for (const status of ['discarded', 'sold', 'donated']) {
      const r = await call(ctx, 'edit_item', { itemId: 'tee', status });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/set_item_photo/);
    }
    expect(data.inbox.size).toBe(0);
    expect((await call(ctx, 'edit_item', { itemId: 'tee', status: 'sold', confirmRetire: true })).isError).toBe(false);
    expect((await call(ctx, 'edit_item', { itemId: 'blazer', status: 'storage' })).isError).toBe(false);
  });

  it('tells Claude to look in the other emails about the order when a receipt line has no image', async () => {
    const { ctx } = setup(fetcher);
    const r = await call(ctx, 'add_receipt_items', { sourceId: 'm11', items: [{ name: 'Linen shirt', category: 'tops' }, { name: 'Wool cap', category: 'accessories', imageUrl: 'https://x.com/good.jpg' }] });
    const [shirt, cap] = r.json().added;
    expect(shirt).toMatchObject({ id: 'receipt-m11-0', photo: false });
    expect(shirt.photoNote).toMatch(/other emails about this same order/);
    expect(shirt.photoNote).toMatch(/set_item_photo/);
    expect(cap).toMatchObject({ photo: true });
    expect(cap.photoNote).toBeUndefined();
  });
});
