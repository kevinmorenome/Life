import { describe, expect, it } from 'vitest';
import { checkinAuthorized, handleCheckin, isCheckinPath, type CheckinContext } from './checkin';
import type { RecordStore } from './records';

function setup(over: Partial<CheckinContext> = {}) {
  const puts: { store: string; id: string; record: Record<string, unknown> }[] = [];
  const store = { put: async (store, id, record) => void puts.push({ store, id, record: record as Record<string, unknown> }) } as RecordStore;
  const ctx: CheckinContext = { store, readOnly: false, now: new Date('2026-10-29T10:00:00Z'), ...over };
  return { puts, ctx };
}

const post = (ctx: CheckinContext, body: unknown, method = 'POST') =>
  handleCheckin(new Request('https://x/mcp/checkin', { method, body: method === 'POST' ? JSON.stringify(body) : undefined }), ctx);

describe('checkinAuthorized', () => {
  const token = 'c'.repeat(32);
  const req = (headers: HeadersInit = {}) => new Request('https://x/mcp/checkin', { headers });

  it('is disabled until a long enough token is set', async () => {
    expect(await checkinAuthorized(req(), '/mcp/checkin', {})).toBe('unconfigured');
    expect(await checkinAuthorized(req(), '/mcp/checkin', { CHECKIN_TOKEN: 'short' })).toBe('unconfigured');
  });

  it('accepts the token as a bearer header or as the path, and nothing else', async () => {
    const env = { CHECKIN_TOKEN: token };
    expect(await checkinAuthorized(req({ Authorization: `Bearer ${token}` }), '/mcp/checkin', env)).toBe('ok');
    expect(await checkinAuthorized(req(), `/mcp/checkin/${token}`, env)).toBe('ok');
    expect(await checkinAuthorized(req(), '/mcp/checkin', env)).toBe('denied');
    expect(await checkinAuthorized(req({ Authorization: 'Bearer nope' }), '/mcp/checkin/nope', env)).toBe('denied');
  });
});

describe('isCheckinPath', () => {
  it('matches the endpoint and its token path only', () => {
    expect(isCheckinPath('/mcp/checkin')).toBe(true);
    expect(isCheckinPath('/mcp/checkin/abc')).toBe(true);
    expect(isCheckinPath('/mcp/checkins')).toBe(false);
    expect(isCheckinPath('/mcp')).toBe(false);
  });
});

describe('handleCheckin', () => {
  it('stores a check-in with the phone’s local date and time', async () => {
    const { puts, ctx } = setup();
    const res = await post(ctx, { type: 'arrive', at: '2026-10-29T09:12:30+01:00' });
    expect(res.status).toBe(200);
    expect(puts).toEqual([
      {
        store: 'workevents',
        id: 'arrive-2026-10-29-0912',
        record: {
          id: 'arrive-2026-10-29-0912',
          type: 'arrive',
          date: '2026-10-29',
          time: '09:12',
          source: 'shortcut',
          createdAt: '2026-10-29T10:00:00.000Z',
          updatedAt: '2026-10-29T10:00:00.000Z',
        },
      },
    ]);
  });

  it('gives a retried check-in the same id', async () => {
    const { puts, ctx } = setup();
    await post(ctx, { type: 'home', at: '2026-10-29T18:00:00+01:00' });
    await post(ctx, { type: 'home', at: '2026-10-29T18:00:41+01:00' });
    expect(new Set(puts.map((p) => p.id)).size).toBe(1);
  });

  it('rejects bad input without writing', async () => {
    const { puts, ctx } = setup();
    for (const body of [
      { type: 'lunch', at: '2026-10-29T09:00:00' },
      { type: 'arrive' },
      { type: 'arrive', at: 'yesterday' },
      { type: 'arrive', at: '2026-02-31T09:00:00' },
      { type: 'arrive', at: '2026-10-29T25:00:00' },
      { type: 'arrive', at: '2026-11-05T09:00:00' },
    ]) {
      expect((await post(ctx, body)).status).toBe(400);
    }
    expect((await handleCheckin(new Request('https://x/mcp/checkin', { method: 'POST', body: 'nope' }), ctx)).status).toBe(400);
    expect(puts).toEqual([]);
  });

  it('only takes POST and refuses writes in a read-only preview', async () => {
    const { puts, ctx } = setup();
    expect((await post(ctx, {}, 'GET')).status).toBe(405);
    const res = await post({ ...ctx, readOnly: true }, { type: 'arrive', at: '2026-10-29T09:00:00' });
    expect(res.status).toBe(409);
    expect(puts).toEqual([]);
  });
});
