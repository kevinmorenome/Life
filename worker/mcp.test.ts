import { describe, expect, it } from 'vitest';
import { handleMcp, mcpAuthorized } from './mcp';
import type { ToolContext } from './mcpTools';
import type { RecordStore, Row } from './records';

type StoreName = 'clothes' | 'outfits' | 'inbox' | 'foodreceipts' | 'foodproducts' | 'foodstock' | 'woltorders' | 'rides' | 'workevents' | 'workdays' | 'checkins' | 'watched' | 'musicdays' | 'gamenights' | 'gametitles';

function fakeStore(seed: Partial<Record<StoreName, Row[]>> = {}) {
  const data: Record<StoreName, Map<string, Row>> = { clothes: new Map(), outfits: new Map(), inbox: new Map(), foodreceipts: new Map(), foodproducts: new Map(), foodstock: new Map(), woltorders: new Map(), rides: new Map(), workevents: new Map(), workdays: new Map(), checkins: new Map(), watched: new Map(), musicdays: new Map(), gamenights: new Map(), gametitles: new Map() };
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
      'add_wolt_orders',
      'add_takeout_orders',
      'add_rides',
      'log_work',
      'list_checkins',
      'venue_history',
      'weekly_digest',
      'list_stock',
      'shopping_list',
      'product_prices',
      'use_stock',
      'count_stock',
      'set_product_info',
      'find_product_photo',
      'set_product_photo',
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

describe('log_work', () => {
  it('stores arrival, departure and the place as fresh events', async () => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'log_work', { date: '2026-10-25', place: 'trip', arrive: '8:45', leave: '17:30' });
    expect(r.isError).toBeFalsy();
    expect([...data.workevents.values()].map((e) => [e.type, e.place, e.time])).toEqual([
      ['arrive', 'trip', '08:45'],
      ['leave', 'trip', '17:30'],
      ['trip', undefined, '00:00'],
    ]);
    // Same call again lands on the same records.
    await call(ctx, 'log_work', { date: '2026-10-25', place: 'trip', arrive: '08:45', leave: '17:30' });
    expect(data.workevents.size).toBe(3);
  });

  it('logs just a place, and rejects bad input and read-only', async () => {
    const { ctx, data } = setup();
    expect((await call(ctx, 'log_work', { date: '2026-10-25', place: 'home' })).isError).toBeFalsy();
    expect([...data.workevents.values()].map((e) => e.type)).toEqual(['home']);
    expect((await call(ctx, 'log_work', { date: '2026-10-25', place: 'moon' })).isError).toBe(true);
    expect((await call(ctx, 'log_work', { date: '2026-10-25', place: 'office', arrive: '25:00' })).isError).toBe(true);
    expect((await call(ctx, 'log_work', { date: '2026-10-25', place: 'office', arrive: '17:00', leave: '09:00' })).isError).toBe(true);
    expect((await call(ctx, 'log_work', { date: '2026-12-25', place: 'office' })).isError).toBe(true);
    const ro = setup({ readOnly: true });
    expect((await call(ro.ctx, 'log_work', { date: '2026-10-25', place: 'office' })).isError).toBe(true);
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
      ['use_stock', { product: 'milk' }],
      ['count_stock', { product: 'milk', quantity: 1 }],
      ['set_product_info', { product: 'milk', packSize: 6 }],
      ['set_product_photo', { product: 'milk', imageUrl: 'https://images.openfoodfacts.org/x.jpg' }],
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

  it('makes a household product (shampoo from dm) a stocked product kept at home, apart from the food', async () => {
    const { ctx, data } = setup();
    const r = await call(ctx, 'add_grocery_receipt', { sourceId: 'dm-1', store: 'dm', date: '2026-11-08', total: 8.65, lines: [{ name: 'HASK Curl shampoo 355 ml', rawName: 'HASK šampon Curl 355ml', kind: 'household', quantity: 1, unitPrice: 7.45 }, { name: 'dmBio tofu natur 200 g', quantity: 1, unitPrice: 1.2, productType: 'fresh', storage: 'fridge' }] });
    expect(r.json().newProducts).toEqual(['HASK Curl shampoo 355 ml', 'dmBio tofu natur 200 g']);
    expect(data.foodproducts.get('fp-hask-curl-shampoo-355-ml')).toMatchObject({ type: 'staple', storage: 'home' });
    expect(data.foodproducts.get('fp-dmbio-natural-tofu-200-g') ?? data.foodproducts.get('fp-dmbio-tofu-natur-200-g')).toMatchObject({ storage: 'fridge' });
  });
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
        { name: 'Cumin', quantity: 1, unitPrice: 1.5, trackAmount: false },
        { name: 'Cider 4-pack', kind: 'alcohol', quantity: 1, unitPrice: 6, packSize: 4, packLabel: 'bottle' },
        { name: 'Odd pack', quantity: 1, unitPrice: 6, packSize: 1, packLabel: 'x' },
        { name: 'Weighed pack', quantity: 0.5, unit: 'kg', unitPrice: 6, packSize: 4 },
        { name: 'Rice', quantity: 1, unitPrice: 1.5, trackAmount: 'no' },
      ],
    });
    expect(r.json().newProducts).toEqual(['Chicken fillet', 'Beer', 'Cumin', 'Cider 4-pack', 'Odd pack', 'Weighed pack', 'Rice']);
    expect(data.foodproducts.get('fp-cider-4-pack')).toMatchObject({ packSize: 4, packLabel: 'bottle' });
    expect(data.foodproducts.get('fp-odd-pack')!.packSize).toBeUndefined();
    expect(data.foodproducts.get('fp-weighed-pack')!.packSize).toBeUndefined();
    expect(data.foodproducts.get('fp-cumin')).toMatchObject({ trackAmount: false });
    expect(data.foodproducts.get('fp-rice')!.trackAmount).toBeUndefined();
    expect(data.foodproducts.get('fp-chicken-fillet')).toMatchObject({ name: 'Chicken fillet', type: 'fresh', storage: 'fridge', shelfLifeDays: 2 });
    expect(data.foodproducts.get('fp-beer')).toMatchObject({ type: 'drink', storage: 'pantry' });
    expect(data.foodproducts.get('fp-beer')!.shelfLifeDays).toBeUndefined();
    expect(data.foodproducts.size).toBe(7);
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

describe('food stock', () => {
  const receipt = (id: string, date: string, lines: object[]) => ({ id, store: 'Konzum', date, lines, createdAt: 'x', updatedAt: 'x' });
  const L = (name: string, quantity: number, over: object = {}) => ({ name, kind: 'food', quantity, unit: 'pc', unitPrice: 2, discount: 0, paid: quantity * 2, ...over });
  const seed = (over: Partial<ToolContext> = {}) => {
    const s = setup(over);
    s.data.foodreceipts.set('food-1', receipt('food-1', '2026-10-20', [L('Hummus', 2), L('Oat drink 3.5%', 3), L('Chicken fillet', 0.5, { unit: 'kg', unitPrice: 6, paid: 3 })]));
    s.data.foodreceipts.set('food-2', receipt('food-2', '2026-10-24', [L('Oat drink 3.5%', 1), L('Oat cookies', 1)]));
    return s;
  };

  it('lists what to buy with the cheapest store, and compares prices per product', async () => {
    const { ctx, data } = seed();
    data.foodstock.set('e0', { id: 'e0', productId: 'fp-oat-cookies', type: 'count', quantity: 0, date: '2026-10-25', createdAt: '2026-10-25T09:00:00Z' });
    data.foodreceipts.set('food-3', { ...receipt('food-3', '2026-10-10', [L('Oat cookies', 1, { unitPrice: 1.5, paid: 1.5 })]), store: 'Lidl' });
    const list = (await call(ctx, 'shopping_list', {})).json() as { name: string; why: string; cheapestStore: string; shelfPrice?: string; savesVersusLastStore?: number }[];
    expect(list).toMatchObject([{ name: 'Oat cookies', why: 'Out', cheapestStore: 'Lidl', shelfPrice: '1.50 each', savesVersusLastStore: 0.5 }]);

    const prices = (await call(ctx, 'product_prices', { product: 'cookies' })).json() as { stores: { store: string; shelfPrice: number }[]; cheaperElsewhere: { store: string; saves: number } };
    expect(prices.stores.map((x) => [x.store, x.shelfPrice])).toEqual([['Lidl', 1.5], ['Konzum', 2]]);
    expect(prices.cheaperElsewhere).toMatchObject({ store: 'Lidl', saves: 0.5 });
    expect((await call(ctx, 'product_prices', { product: 'oat' })).isError).toBe(true); // oat drink and oat cookies
  });

  it('keeps purchases apart as batches and acts on one of them', async () => {
    const { ctx, data } = seed();
    const listed = (await call(ctx, 'list_stock', { query: 'oat drink' })).json() as { quantity: number; batches?: { boughtOn: string; quantity: number }[] }[];
    expect(listed[0].batches).toEqual([{ boughtOn: '2026-10-20', quantity: 3 }, { boughtOn: '2026-10-24', quantity: 1 }]);

    const out = (await call(ctx, 'use_stock', { product: 'oat drink', boughtOn: '2026-10-24', action: 'toss' })).json() as { left: number; batch: string };
    expect(out).toMatchObject({ recorded: 'toss', batch: 'bought 2026-10-24', left: 3 });
    expect([...data.foodstock.values()][0]).toMatchObject({ type: 'toss', quantity: 1, batch: 'food-2:0' });

    const used = (await call(ctx, 'use_stock', { product: 'oat drink', boughtOn: '2026-10-20', quantity: 2 })).json() as { left: number };
    expect(used.left).toBe(1);
    const missing = await call(ctx, 'use_stock', { product: 'oat drink', boughtOn: '2026-10-24' });
    expect(missing.isError).toBe(true); // that batch is gone, and the message lists what is left
    expect(JSON.stringify(missing)).toContain('2026-10-20: 1');
    expect((await call(ctx, 'use_stock', { product: 'hummus', boughtOn: '2026-10-20', action: 'some_left', fractionLeft: 0.5 })).isError).toBe(true);
  });

  it('puts part of a batch in the freezer and takes it out again', async () => {
    const { ctx, data } = seed();
    const frozen = (await call(ctx, 'use_stock', { product: 'oat drink', boughtOn: '2026-10-20', action: 'freeze', quantity: 2 })).json() as { moved: string; inFreezerNow: number; left: number };
    expect(frozen).toMatchObject({ recorded: 'freeze', moved: '2', inFreezerNow: 2, left: 4 });
    expect([...data.foodstock.values()][0]).toMatchObject({ type: 'freeze', quantity: 2, batch: 'food-1:1' });

    const listed = (await call(ctx, 'list_stock', { query: 'oat drink' })).json() as { inFreezer: number; batches: { frozenOn?: string; boughtOn: string; quantity: number }[] }[];
    expect(listed[0].inFreezer).toBe(2);
    expect(listed[0].batches.find((b) => b.frozenOn)).toMatchObject({ boughtOn: '2026-10-20', quantity: 2 });

    expect((await call(ctx, 'use_stock', { product: 'oat drink', boughtOn: '2026-10-24', action: 'thaw' })).isError).toBe(true); // that batch is not frozen
    const out = (await call(ctx, 'use_stock', { product: 'oat drink', action: 'thaw' })).json() as { moved: string; inFreezerNow: number };
    expect(out).toMatchObject({ moved: '2', inFreezerNow: 0 });
    expect((await call(ctx, 'use_stock', { product: 'oat drink', action: 'thaw' })).isError).toBe(true); // nothing is frozen now
    expect((await call(ctx, 'use_stock', { product: 'hummus', action: 'freeze', quantity: 'all' })).isError).toBe(true);
  });

  it('refuses to freeze food that was thawed, and tells Claude to push using it', async () => {
    const { ctx } = seed();
    await call(ctx, 'use_stock', { product: 'oat drink', boughtOn: '2026-10-20', action: 'freeze', quantity: 2 });
    await call(ctx, 'use_stock', { product: 'oat drink', action: 'thaw', quantity: 1 });
    const listed = (await call(ctx, 'list_stock', { query: 'oat drink' })).json() as { thawed: number; note: string; status: string; batches: { thawedOn?: string }[] }[];
    expect(listed[0]).toMatchObject({ thawed: 1, status: 'use-soon' });
    expect(listed[0].note).toContain('do not refreeze');
    expect(listed[0].batches.some((b) => b.thawedOn)).toBe(true);

    // freeze the rest, take one out: now what is outside the freezer is only thawed
    await call(ctx, 'use_stock', { product: 'oat drink', boughtOn: '2026-10-20', action: 'freeze' });
    const again = await call(ctx, 'use_stock', { product: 'oat drink', boughtOn: '2026-10-20', action: 'freeze' });
    expect(again.isError).toBe(true);
    expect(JSON.stringify(again)).toContain('thawed');
    // with no batch named, the other purchase that is still in the fridge is frozen (only thawed food is left out)
    expect((await call(ctx, 'use_stock', { product: 'oat drink', action: 'freeze' })).isError).toBeFalsy();
    const noBatch = await call(ctx, 'use_stock', { product: 'oat drink', action: 'freeze' });
    expect(noBatch.isError).toBe(true);
    expect(JSON.stringify(noBatch)).toContain('thawed');
  });

  it('keeps what Claude logs out of the statistics when asked', async () => {
    const { ctx, data } = seed();
    await call(ctx, 'use_stock', { product: 'oat drink', boughtOn: '2026-10-24', action: 'toss', notInStats: true });
    await call(ctx, 'use_stock', { product: 'hummus', quantity: 1 });
    await call(ctx, 'count_stock', { product: 'hummus', quantity: 1, notInStats: true });
    const events = [...data.foodstock.values()] as unknown as { type: string; untracked?: boolean }[];
    expect(events.find((e) => e.type === 'toss')).toMatchObject({ untracked: true });
    expect(events.find((e) => e.type === 'use')?.untracked).toBeUndefined();
    expect(events.find((e) => e.type === 'count')).toMatchObject({ untracked: true });
  });

  it('lists what is in stock with status and use-by, leaving out what is gone', async () => {
    const { ctx, data } = seed();
    data.foodstock.set('e0', { id: 'e0', productId: 'fp-oat-cookies', type: 'count', quantity: 0, date: '2026-10-25', createdAt: '2026-10-25T09:00:00Z' });
    const out = (await call(ctx, 'list_stock', {})).json() as { name: string; quantity: number; status: string; useBy?: string }[];
    expect(out.map((p) => p.name).sort()).toEqual(['Chicken fillet', 'Hummus', 'Oat drink 3.5%']);
    expect(out.find((p) => p.name === 'Oat drink 3.5%')).toMatchObject({ quantity: 4, status: 'ok' });
    expect(out.find((p) => p.name === 'Chicken fillet')).toMatchObject({ status: 'use-soon', useBy: '2026-10-25' });
    expect((await call(ctx, 'list_stock', { query: 'cook', includeOut: true })).json()).toMatchObject([{ name: 'Oat cookies', status: 'out' }]);
  });

  it('records use, finish and toss as new events and reports what is left', async () => {
    const { ctx, data } = seed();
    expect((await call(ctx, 'use_stock', { product: 'oat drink', quantity: 2 })).json()).toMatchObject({ recorded: 'use', used: '2', left: 2 });
    expect((await call(ctx, 'use_stock', { product: 'hummus', action: 'finish' })).json()).toMatchObject({ recorded: 'finish', left: 0 });
    expect((await call(ctx, 'use_stock', { product: 'chicken', action: 'toss' })).json()).toMatchObject({ recorded: 'toss', left: 0 });
    const events = [...data.foodstock.values()];
    expect(events.map((e) => [e.productId, e.type, e.quantity, e.source])).toEqual([
      ['fp-oat-drink-3-5', 'use', 2, 'claude'], ['fp-hummus', 'count', 0, 'claude'], ['fp-chicken-fillet', 'toss', 0.5, 'claude'],
    ]);
  });

  it('records part of a pack used up from how much is left', async () => {
    const { ctx, data } = seed();
    // 2 hummus bought: half of the open one left → 1.5 pieces
    expect((await call(ctx, 'use_stock', { product: 'hummus', action: 'some_left', fractionLeft: 0.5 })).json()).toMatchObject({ recorded: 'some_left', used: '0.5', left: 1.5 });
    // already at ½: "¾ left" would raise it, "¼ left" lowers it
    expect((await call(ctx, 'use_stock', { product: 'hummus', action: 'some_left', fractionLeft: 0.75 })).isError).toBe(true);
    expect((await call(ctx, 'use_stock', { product: 'hummus', action: 'some_left', fractionLeft: 0.25 })).json()).toMatchObject({ used: '0.25', left: 1.25 });
    // weighed: a fraction of what there was
    expect((await call(ctx, 'use_stock', { product: 'chicken', action: 'some_left', fractionLeft: 0.5 })).json()).toMatchObject({ used: '0.25', left: 0.25 });
    expect([...data.foodstock.values()].map((e) => [e.productId, e.type, e.quantity])).toEqual([
      ['fp-hummus', 'use', 0.5], ['fp-hummus', 'use', 0.25], ['fp-chicken-fillet', 'use', 0.25],
    ]);
    for (const bad of [0, 1, 2, -0.5, 'half', undefined]) {
      expect((await call(ctx, 'use_stock', { product: 'oat drink', action: 'some_left', fractionLeft: bad })).isError).toBe(true);
    }
    await call(ctx, 'use_stock', { product: 'hummus', action: 'finish' });
    expect((await call(ctx, 'use_stock', { product: 'hummus', action: 'some_left', fractionLeft: 0.5 })).isError).toBe(true);
  });

  it('spices and the like are only have-it-or-out: a use is logged but never lowers them', async () => {
    const { ctx, data } = seed();
    data.foodreceipts.set('food-3', receipt('food-3', '2026-10-22', [L('Smoked paprika', 1)]));
    data.foodproducts.set('fp-smoked-paprika', { id: 'fp-smoked-paprika', name: 'Smoked paprika', type: 'staple', storage: 'pantry', trackAmount: false });
    expect((await call(ctx, 'list_stock', { query: 'paprika' })).json()).toMatchObject([{ name: 'Smoked paprika', tracking: 'have it or out (no amount)', have: true, status: 'ok' }]);
    for (let i = 0; i < 3; i++) {
      expect((await call(ctx, 'use_stock', { product: 'paprika', quantity: 5 })).json()).toMatchObject({ recorded: 'use', have: true });
    }
    expect([...data.foodstock.values()].map((e) => [e.type, e.quantity])).toEqual([['use', 1], ['use', 1], ['use', 1]]);
    expect((await call(ctx, 'use_stock', { product: 'paprika', action: 'some_left', fractionLeft: 0.5 })).isError).toBe(true);
    expect((await call(ctx, 'use_stock', { product: 'paprika', action: 'finish' })).json()).toMatchObject({ have: false });
    expect((await call(ctx, 'list_stock', { query: 'paprika' })).text).toMatch(/Nothing matches/);
    expect((await call(ctx, 'count_stock', { product: 'paprika', quantity: 1 })).json()).toMatchObject({ counted: 'Smoked paprika', have: true });
  });

  describe('product pictures', () => {
    const photo = 'data:image/jpeg;base64,AAAA';
    const candidates = [{ code: '3850131003398', name: 'Staropramen', brand: 'Staropramen', quantity: '0,5 l', country: 'croatia', imageUrl: 'https://images.openfoodfacts.org/images/products/385/013/100/3398/front_hr.3.400.jpg' }];
    const withSearch = (result: { candidates: typeof candidates; error?: string }, calls: object[] = []) => ({
      searchPhotos: async (input: object) => {
        calls.push(input);
        return result;
      },
      fetchPhoto: async (url: string) => (url.startsWith('https://images.') ? photo : undefined),
    });

    it('list_stock says which products have a picture, without loading it', async () => {
      const { ctx, data } = seed();
      data.foodproducts.set('fp-hummus', { id: 'fp-hummus', name: 'Hummus', type: 'staple', storage: 'fridge', hasPhoto: 1 });
      const out = (await call(ctx, 'list_stock', {})).json() as { name: string; picture: string }[];
      expect(out.find((p) => p.name === 'Hummus')?.picture).toBe('set');
      expect(out.filter((p) => p.name !== 'Hummus').every((p) => p.picture === 'none')).toBe(true);
    });

    it('find_product_photo searches with the product name, a barcode or words, and lists the candidates', async () => {
      const calls: object[] = [];
      const { ctx } = setup(withSearch({ candidates }, calls));
      ctx.store.put('foodreceipts', 'r', { id: 'r', store: 'K', date: '2026-10-24', lines: [{ name: 'Staropramen beer', rawName: 'PIVO STAROPRAMEN 6PA', kind: 'alcohol', quantity: 1, unit: 'pc', unitPrice: 1, discount: 0, paid: 1 }] });
      const byName = (await call(ctx, 'find_product_photo', { product: 'staropramen' })).json();
      expect(calls[0]).toEqual({ query: 'Staropramen beer', rawName: 'PIVO STAROPRAMEN 6PA', code: undefined, store: 'K' });
      expect(byName.candidates[0]).toMatchObject({ name: 'Staropramen', code: '3850131003398', imageUrl: candidates[0].imageUrl });
      await call(ctx, 'find_product_photo', { code: '3850131003398' });
      await call(ctx, 'find_product_photo', { query: 'somersby cider' });
      expect(calls.slice(1)).toEqual([{ query: undefined, rawName: undefined, code: '3850131003398' }, { query: 'somersby cider', rawName: undefined, code: undefined }]);
    });

    it('find_product_photo says so when there is nothing, when the search fails and when it is unavailable', async () => {
      expect((await call(setup(withSearch({ candidates: [] })).ctx, 'find_product_photo', { query: 'x' })).json().note).toMatch(/photograph/);
      const failed = await call(setup(withSearch({ candidates: [], error: 'Open Food Facts is busy right now' })).ctx, 'find_product_photo', { query: 'x' });
      expect(failed.isError).toBe(true);
      expect(failed.text).toMatch(/busy/);
      expect((await call(setup().ctx, 'find_product_photo', { query: 'x' })).isError).toBe(true);
      expect((await call(setup(withSearch({ candidates })).ctx, 'find_product_photo', { product: 'caviar' })).isError).toBe(true);
    });

    it('set_product_photo queues the picture for the app instead of writing the product', async () => {
      const { ctx, data } = seed(withSearch({ candidates }));
      const r = (await call(ctx, 'set_product_photo', { product: 'hummus', imageUrl: 'https://images.openfoodfacts.org/h.jpg' })).json();
      expect(r).toMatchObject({ product: 'Hummus', queued: 'picture', applied: 'when the app next syncs' });
      expect(data.foodproducts.size).toBe(0);
      expect([...data.inbox.values()]).toMatchObject([{ type: 'product-edit', productId: 'fp-hummus', source: 'claude', changes: { photo }, base: { name: 'Hummus' } }]);
    });

    it('set_product_photo refuses a bad url, an image it cannot download, and an unknown or ambiguous product', async () => {
      const { ctx, data } = seed(withSearch({ candidates }));
      for (const args of [
        { product: 'hummus', imageUrl: 'http://images.example/h.jpg' },
        { product: 'hummus', imageUrl: 'https://nowhere.example/h.jpg' },
        { product: 'caviar', imageUrl: 'https://images.example/h.jpg' },
        { product: 'oat', imageUrl: 'https://images.example/h.jpg' },
      ]) {
        expect((await call(ctx, 'set_product_photo', args)).isError).toBe(true);
      }
      expect(data.inbox.size).toBe(0);
    });
  });

  describe('set_product_info', () => {
    const beer = () => {
      const s = seed();
      s.data.foodreceipts.set('food-4', receipt('food-4', '2026-10-24', [L('Staropramen beer 6-pack', 2, { kind: 'alcohol' })]));
      return s;
    };

    it('sets a pack size at once on a product that has no settings yet, and stock counts in cans straight away', async () => {
      const { ctx, data } = beer();
      expect((await call(ctx, 'list_stock', { query: 'beer' })).json()).toMatchObject([{ quantity: 2 }]);
      const r = (await call(ctx, 'set_product_info', { product: 'staropramen', packSize: 6, packLabel: 'can' })).json();
      expect(r).toMatchObject({ product: 'Staropramen beer 6-pack', applied: 'now' });
      expect(data.foodproducts.get('fp-staropramen-beer-6-pack')).toMatchObject({ name: 'Staropramen beer 6-pack', type: 'drink', storage: 'pantry', packSize: 6, packLabel: 'can' });
      expect(data.inbox.size).toBe(0);
      expect((await call(ctx, 'list_stock', { query: 'beer' })).json()).toMatchObject([{ quantity: 12, unit: 'cans' }]);
      expect((await call(ctx, 'use_stock', { product: 'beer', quantity: 2 })).json()).toMatchObject({ left: 10 });
    });

    it('queues the change instead of touching a product that already has settings', async () => {
      const { ctx, data } = beer();
      data.foodproducts.set('fp-staropramen-beer-6-pack', { id: 'fp-staropramen-beer-6-pack', name: 'Staropramen beer 6-pack', type: 'drink', storage: 'fridge', shelfLifeDays: 90 });
      const before = JSON.stringify(data.foodproducts.get('fp-staropramen-beer-6-pack'));
      const r = (await call(ctx, 'set_product_info', { product: 'beer', packSize: 6, packLabel: 'can' })).json();
      expect(r).toMatchObject({ queued: 'packSize: 6, packLabel: can', applied: 'when the app next syncs' });
      expect(r.note).toMatch(/wait before logging uses/);
      expect(JSON.stringify(data.foodproducts.get('fp-staropramen-beer-6-pack'))).toBe(before);
      expect([...data.inbox.values()]).toMatchObject([
        { type: 'product-edit', productId: 'fp-staropramen-beer-6-pack', source: 'claude', changes: { packSize: 6, packLabel: 'can' }, base: { storage: 'fridge' } },
      ]);
    });

    it('can clear a pack size, and turn counting off for spices', async () => {
      const { ctx, data } = beer();
      await call(ctx, 'set_product_info', { product: 'hummus', trackAmount: false });
      expect(data.foodproducts.get('fp-hummus')).toMatchObject({ trackAmount: false });
      await call(ctx, 'set_product_info', { product: 'hummus', packSize: null });
      expect([...data.inbox.values()][0]).toMatchObject({ changes: { packSize: null } });
    });

    it('refuses bad values, nothing to change, weighed products, unknown or ambiguous products', async () => {
      const { ctx, data } = beer();
      for (const args of [{ product: 'beer', packSize: 1 }, { product: 'beer', packSize: 'six' }, { product: 'beer', type: 'dessert' }, { product: 'beer' }, { product: 'chicken', packSize: 4 }, { product: 'caviar', packSize: 4 }, { product: 'oat', packSize: 4 }]) {
        expect((await call(ctx, 'set_product_info', args)).isError).toBe(true);
      }
      expect(data.foodproducts.size + data.inbox.size).toBe(0);
    });
  });

  it('counts multipacks in single items', async () => {
    const { ctx, data } = seed();
    data.foodreceipts.set('food-4', receipt('food-4', '2026-10-24', [L('Staropramen beer 6-pack', 2, { kind: 'alcohol' })]));
    data.foodproducts.set('fp-staropramen-beer-6-pack', { id: 'fp-staropramen-beer-6-pack', name: 'Staropramen beer 6-pack', type: 'drink', storage: 'pantry', packSize: 6, packLabel: 'can' });
    expect((await call(ctx, 'list_stock', { query: 'beer' })).json()).toMatchObject([{ name: 'Staropramen beer 6-pack', quantity: 12, unit: 'cans', packSize: 6 }]);
    expect((await call(ctx, 'use_stock', { product: 'beer', quantity: 2 })).json()).toMatchObject({ used: '2', left: 10, unit: 'cans' });
    expect((await call(ctx, 'count_stock', { product: 'beer', quantity: 1 })).json()).toMatchObject({ quantity: 1, unit: 'can' });
    const partial = await call(ctx, 'use_stock', { product: 'beer', action: 'some_left', fractionLeft: 0.5 });
    expect(partial.isError).toBe(true);
    expect(partial.text).toMatch(/packs of 6/);
  });

  it('counts, and warns when more was used than was thought to be in stock', async () => {
    const { ctx } = seed();
    expect((await call(ctx, 'count_stock', { product: 'hummus', quantity: 1 })).json()).toMatchObject({ counted: 'Hummus', quantity: 1 });
    const over = (await call(ctx, 'use_stock', { product: 'hummus', quantity: 5 })).json();
    expect(over).toMatchObject({ left: 0 });
    expect(over.note).toMatch(/Only 1/);
  });

  it('fails on unknown or ambiguous products, bad numbers and a toss with nothing left', async () => {
    const { ctx } = seed();
    expect((await call(ctx, 'use_stock', { product: 'caviar' })).isError).toBe(true);
    const ambiguous = await call(ctx, 'use_stock', { product: 'oat' });
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.text).toMatch(/Oat drink 3.5%.*Oat cookies|Oat cookies.*Oat drink 3.5%/);
    expect((await call(ctx, 'use_stock', { product: 'hummus', quantity: -1 })).isError).toBe(true);
    expect((await call(ctx, 'count_stock', { product: 'hummus', quantity: -1 })).isError).toBe(true);
    expect((await call(ctx, 'use_stock', { product: 'hummus', date: '2026-02-31' })).isError).toBe(true);
    await call(ctx, 'use_stock', { product: 'hummus', action: 'finish' });
    expect((await call(ctx, 'use_stock', { product: 'hummus', action: 'toss' })).isError).toBe(true);
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

describe('add_takeout_orders', () => {
  it('saves Bolt and Uber orders under their own ids and refuses other services', async () => {
    const { data, ctx } = setup();
    const call = async (args: unknown) => JSON.parse((await rpc(ctx, 'tools/call', { name: 'add_takeout_orders', arguments: args })).result.content[0].text);
    const order = { sourceId: 'x1', restaurant: 'Pizza', date: '2026-05-03', total: 12 };
    expect(await call({ service: 'bolt', orders: [order] })).toMatchObject({ added: 1 });
    expect(await call({ service: 'uber', orders: [order] })).toMatchObject({ added: 1 });
    expect(await call({ service: 'bolt', orders: [order] })).toMatchObject({ added: 0, alreadyAdded: 1 });
    expect(data.woltorders.get('bolt-x1')).toMatchObject({ service: 'bolt' });
    expect(data.woltorders.get('uber-x1')).toMatchObject({ service: 'uber' });
    const bad = (await rpc(ctx, 'tools/call', { name: 'add_takeout_orders', arguments: { service: 'wolt', orders: [order] } })).result;
    expect(bad.isError).toBe(true);
  });
});

describe('add_wolt_orders', () => {
  const call = async (ctx: ToolContext, orders: unknown[]) => {
    const r = (await rpc(ctx, 'tools/call', { name: 'add_wolt_orders', arguments: { orders } })).result;
    return JSON.parse(r.content[0].text);
  };
  it('saves new orders once and never overwrites', async () => {
    const { data, ctx } = setup();
    const order = { sourceId: 'w1', restaurant: "McDonald's - Rotor", date: '2026-05-03', time: '22:36', total: 9.61 };
    expect(await call(ctx, [order])).toMatchObject({ added: 1, alreadyAdded: 0 });
    data.woltorders.set('wolt-w1', { ...data.woltorders.get('wolt-w1')!, restaurant: 'My edit' });
    expect(await call(ctx, [order, { sourceId: 'bad' }])).toMatchObject({ added: 0, alreadyAdded: 1, rejected: [expect.any(String)] });
    expect(data.woltorders.get('wolt-w1')).toMatchObject({ restaurant: 'My edit', currency: 'EUR' });
  });
});

describe('add_rides', () => {
  const call = async (ctx: ToolContext, rides: unknown[]) => {
    const r = (await rpc(ctx, 'tools/call', { name: 'add_rides', arguments: { rides } })).result;
    return JSON.parse(r.content[0].text);
  };
  it('saves new rides once and never overwrites', async () => {
    const { data, ctx } = setup();
    const ride = { provider: 'bolt', sourceId: 'r1', date: '2026-05-03', time: '22:36', to: 'Ilica 12', fare: 7.4 };
    expect(await call(ctx, [ride])).toMatchObject({ added: 1, alreadyAdded: 0 });
    data.rides.set('ride-bolt-r1', { ...data.rides.get('ride-bolt-r1')!, to: 'My edit' });
    expect(await call(ctx, [ride, { sourceId: 'bad' }])).toMatchObject({ added: 0, alreadyAdded: 1, rejected: [expect.any(String)] });
    expect(data.rides.get('ride-bolt-r1')).toMatchObject({ to: 'My edit', currency: 'EUR' });
  });
});

describe('places and the weekly digest', () => {
  const CHECKINS: Row[] = [
    { id: 'swarm-1', venue: 'Cafe Nero', venueId: 'v-nero', category: 'Coffee Shop', city: 'Zagreb', country: 'Croatia', date: '2026-10-20', time: '09:10', source: 'swarm' },
    { id: 'swarm-2', venue: 'Office', venueId: 'v-office', category: 'Office', city: 'Zagreb', country: 'Croatia', date: '2026-10-20', time: '10:00', source: 'swarm' },
    { id: 'swarm-3', venue: 'Cafe Nero', venueId: 'v-nero', category: 'Coffee Shop', city: 'Zagreb', country: 'Croatia', date: '2026-10-14', time: '08:30', source: 'swarm' },
    { id: 'swarm-4', venue: 'Museum', venueId: 'v-museum', category: 'Museum', city: 'Vienna', country: 'Austria', date: '2026-10-24', time: '', source: 'swarm' },
    { id: 'swarm-5', venue: 'Old pub', venueId: 'v-pub', city: 'Zagreb', date: '2026-09-01', time: '20:00', source: 'swarm' },
  ];
  const seed = { clothes: ITEMS, outfits: OUTFITS, checkins: CHECKINS };

  it('list_checkins answers where the user was on a day, newest first, with what was worn', async () => {
    const { ctx } = setup({}, seed);
    const r = (await call(ctx, 'list_checkins', { date: '2026-10-20', includeWorn: true })).json();
    expect(r.total).toBe(2);
    expect(r.checkins.map((c: { venue: string }) => c.venue)).toEqual(['Office', 'Cafe Nero']);
    expect(r.worn).toEqual([{ date: '2026-10-20', outfits: ['Work look'], items: [] }]);
  });

  it('list_checkins filters by words, city and range, and limits', async () => {
    const { ctx } = setup({}, seed);
    expect((await call(ctx, 'list_checkins', { query: 'coffee' })).json().total).toBe(2);
    expect((await call(ctx, 'list_checkins', { city: 'vienna' })).json().checkins[0].venue).toBe('Museum');
    expect((await call(ctx, 'list_checkins', { from: '2026-10-01', to: '2026-10-31', limit: 2 })).json()).toMatchObject({ total: 4, showing: 2 });
    expect((await call(ctx, 'list_checkins', { date: '2026-01-01' })).json().note).toMatch(/No check-ins match/);
  });

  it('list_checkins rejects bad dates', async () => {
    const { ctx } = setup({}, seed);
    expect((await call(ctx, 'list_checkins', { date: 'last tuesday' })).isError).toBe(true);
    expect((await call(ctx, 'list_checkins', { from: '2026-10-02', to: '2026-10-01' })).isError).toBe(true);
  });

  it('venue_history gives visits, first and last visit and the latest days', async () => {
    const { ctx } = setup({}, seed);
    const r = (await call(ctx, 'venue_history', { query: 'nero', includeWorn: true })).json();
    expect(r.places).toEqual([
      expect.objectContaining({ venue: 'Cafe Nero', visits: 2, firstVisit: '2026-10-14', lastVisit: '2026-10-20', recentDays: ['2026-10-20', '2026-10-14'] }),
    ]);
    expect(r.places[0].worn[0]).toEqual({ date: '2026-10-20', outfits: ['Work look'], items: [] });
    expect((await call(ctx, 'venue_history', { query: '' })).isError).toBe(true);
    expect((await call(ctx, 'venue_history', { query: 'nowhere' })).text).toMatch(/No check-ins match/);
  });

  it('weekly_digest sums up places, outfits and work for the period', async () => {
    const { ctx } = setup(
      {},
      {
        ...seed,
        workevents: [{ id: 'e1', type: 'arrive', date: '2026-10-20', time: '09:00', source: 'x' }, { id: 'e2', type: 'leave', date: '2026-10-20', time: '17:00', source: 'x' }],
        workdays: [{ id: '2026-10-21', status: 'home' }],
      } as never,
    );
    const r = (await call(ctx, 'weekly_digest', { end: '2026-10-25' })).json();
    expect(r.period).toEqual({ start: '2026-10-19', end: '2026-10-25', days: 7 });
    expect(r.places).toMatchObject({ checkins: 3, distinctPlaces: 3, daysOut: 2, previousCheckins: 1, countries: ['Croatia', 'Austria'] });
    expect(r.places.newPlaces.map((p: { name: string }) => p.name)).toEqual(['Office', 'Museum']);
    expect(r.outfits).toMatchObject({ daysLogged: 1, outfits: [{ name: 'Work look', times: 1 }] });
    expect(r.outfits.notLogged).toHaveLength(6);
    expect(r.work).toMatchObject({ officeDays: 1, homeDays: 1, averageAtOffice: '8h 00m' });
    expect(r.note).toMatch(/not complete yet/);
  });

  it('weekly_digest defaults to the 7 days ending yesterday and rejects a bad end', async () => {
    const { ctx } = setup({}, seed);
    const last = (await call(ctx, 'weekly_digest', {})).json();
    expect(last.period).toEqual({ start: '2026-10-18', end: '2026-10-24', days: 7 });
    expect(last.note).toBeUndefined();
    expect((await call(ctx, 'weekly_digest', { end: 'soon' })).isError).toBe(true);
    expect((await call(ctx, 'weekly_digest', { end: '2026-10-25', days: 3 })).json().period.days).toBe(3);
  });

  it('weekly_digest includes the other modules when they have something in the period', async () => {
    const { ctx } = setup(
      {},
      {
        ...seed,
        woltorders: [{ id: 'w1', restaurant: "McDonald's - Rotor", date: '2026-10-21', total: 10, currency: 'EUR' }],
        rides: [{ id: 'r1', provider: 'bolt', date: '2026-10-22', fare: 6, currency: 'EUR' }],
        foodreceipts: [{ id: 'f1', store: 'Konzum', date: '2026-10-23', lines: [{ paid: 12.5 }, { paid: 2 }] }],
        watched: [{ id: 'p1', kind: 'episode', title: 'Severance', at: '2026-10-24T20:00:00.000Z' }],
        musicdays: [{ id: 'm1', date: '2026-10-20', plays: 30, ms: 3_600_000, topArtists: [{ name: 'Bicep', plays: 8 }] }],
        gametitles: [{ id: 'g1', name: 'Catan' }],
        gamenights: [{ id: 'n1', date: '2026-10-24', matches: [{ titleId: 'g1' }, { titleId: 'g1', live: true }] }],
      } as never,
    );
    const r = (await call(ctx, 'weekly_digest', { end: '2026-10-25' })).json();
    expect(r.other).toEqual({
      takeout: { orders: 1, spentEur: 10, otherCurrencyOrders: 0, places: [{ name: "McDonald's", times: 1 }] },
      rides: { rides: 1, spentEur: 6, otherCurrencyRides: 0 },
      groceries: { receipts: 1, spent: 14.5, stores: [{ name: 'Konzum', times: 1 }] },
      watching: { plays: 1, movies: 0, episodes: 1, top: [{ name: 'Severance', times: 1 }] },
      music: { plays: 30, hours: 1, daysWithMusic: 1, topArtists: [{ name: 'Bicep', times: 8 }] },
      games: { games: 1, days: 1, titles: [{ name: 'Catan', times: 1 }] },
    });
  });
});
