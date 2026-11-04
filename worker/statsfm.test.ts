import { describe, expect, it } from 'vitest';
import { dayRecord, groupByDay, handleStatsfm, isStatsfmPath, isUser, namesNeeded, PAGE, startOfDay, validZone, type MusicDayRecord, type StatsfmContext } from './statsfm';

const now = new Date('2026-11-03T12:00:00Z');
const stream = (endTime: string, trackId: number, artistIds: number[], playedMs = 180_000) => ({ endTime, trackId, trackName: `Track ${trackId}`, artistIds, playedMs });

describe('paths and ids', () => {
  it('matches the routes under /api/statsfm/ only', () => {
    expect(isStatsfmPath('/api/statsfm/sync')).toBe(true);
    expect(isStatsfmPath('/api/trakt/sync')).toBe(false);
  });
  it('accepts plain custom IDs only', () => {
    expect(isUser('kevinmorenom')).toBe(true);
    expect(isUser('a/../b')).toBe(false);
    expect(isUser('')).toBe(false);
    expect(isUser(undefined)).toBe(false);
  });
});

describe('time zones', () => {
  it('falls back to UTC for a name that is not a zone', () => {
    expect(validZone('Europe/Zagreb')).toBe('Europe/Zagreb');
    expect(validZone('Nowhere/Land')).toBe('UTC');
    expect(validZone(undefined)).toBe('UTC');
  });
  it('finds local midnight, winter and summer', () => {
    expect(new Date(startOfDay('2026-01-15', 'Europe/Zagreb')).toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(new Date(startOfDay('2026-07-15', 'Europe/Zagreb')).toISOString()).toBe('2026-07-14T22:00:00.000Z');
    expect(new Date(startOfDay('2026-07-15', 'UTC')).toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });
});

describe('condensing a day', () => {
  const plays = [
    stream('2026-11-02T22:30:00Z', 1, [10]), // 23:30 in Zagreb: still 2 Nov
    stream('2026-11-02T23:30:00Z', 2, [10, 11]), // 00:30 on 3 Nov
    stream('2026-11-03T08:00:00Z', 2, [10, 11]),
    stream('2026-11-03T08:10:00Z', 2, [10, 11]),
  ];

  it('groups by the local date and counts plays per local hour', () => {
    const days = groupByDay(plays, 'Europe/Zagreb');
    expect(days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03']);
    expect(days[0].hours[23]).toBe(1);
    expect(days[1].hours[0]).toBe(1);
    expect(days[1].hours[9]).toBe(2);
  });

  it('ranks tracks and artists and names them', () => {
    const day = groupByDay(plays, 'Europe/Zagreb')[1];
    expect(namesNeeded(day).sort()).toEqual([10, 11]);
    const rec = dayRecord(day, new Map([[10, 'Ten'], [11, 'Eleven']]), now);
    expect(rec).toMatchObject({ id: 'music-2026-11-03', plays: 3, ms: 540_000, tracks: 1, artists: 2 });
    expect(rec.topTracks).toEqual([{ id: 2, name: 'Track 2', plays: 3, artist: 'Ten' }]);
    expect(rec.topArtists).toEqual([{ id: 10, name: 'Ten', plays: 3 }, { id: 11, name: 'Eleven', plays: 3 }]);
  });

  it('keeps only the top five', () => {
    const many = Array.from({ length: 8 }, (_, i) => stream('2026-11-03T10:00:00Z', i + 1, [i + 1]));
    const rec = dayRecord(groupByDay(many, 'UTC')[0], new Map(), now);
    expect(rec.topTracks).toHaveLength(5);
    expect(rec.tracks).toBe(8);
  });

  it('skips plays with no usable time', () => {
    expect(groupByDay([{ trackId: 1 }, stream('nope', 2, [1])], 'UTC')).toEqual([]);
  });
});

describe('POST /api/statsfm/sync', () => {
  function setup(items: object[], profile: object = { item: { displayName: 'K', timezone: 'Europe/Zagreb', privacySettings: { streams: true } } }, readOnly = false) {
    const saved: MusicDayRecord[][] = [];
    const urls: string[] = [];
    const ctx: StatsfmContext = {
      save: async (days) => void saved.push(days),
      readOnly,
      now,
      fetch: (async (url: string) => {
        urls.push(url);
        if (/\/artists\/list/.test(url)) return new Response(JSON.stringify({ items: [{ id: 10, name: 'Ten' }] }));
        if (/\/streams/.test(url)) return new Response(JSON.stringify({ items }));
        return new Response(JSON.stringify(profile), { status: 'item' in profile ? 200 : 404 });
      }) as typeof fetch,
    };
    const post = (body: unknown) => handleStatsfm(new Request('https://x/api/statsfm/sync', { method: 'POST', body: JSON.stringify(body) }), '/api/statsfm/sync', ctx);
    return { saved, urls, post, ctx };
  }

  it('writes a record per day and finishes when the page is short', async () => {
    const t = setup([stream('2026-11-02T10:00:00Z', 1, [10]), stream('2026-11-03T10:00:00Z', 1, [10])]);
    const res = await t.post({ user: 'kevinmorenom' });
    expect(await res.json()).toMatchObject({ ok: true, days: 2, next: null, newest: '2026-11-03' });
    expect(t.saved[0].map((d) => d.id)).toEqual(['music-2026-11-02', 'music-2026-11-03']);
    expect(t.saved[0][0].topArtists[0].name).toBe('Ten');
  });

  it('asks from the local start of the given day', async () => {
    const t = setup([]);
    await t.post({ user: 'kevinmorenom', from: '2026-11-01' });
    const url = new URL(t.urls.find((u) => u.includes('/streams'))!);
    expect(url.searchParams.get('order')).toBe('asc');
    expect(url.searchParams.get('after')).toBe(String(Date.parse('2026-10-31T23:00:00Z')));
  });

  it('leaves the newest day of a full page for the next request', async () => {
    const full = Array.from({ length: PAGE }, (_, i) => stream(i < PAGE - 5 ? '2026-11-02T10:00:00Z' : '2026-11-03T10:00:00Z', 1, [10]));
    const t = setup(full);
    const body = await (await t.post({ user: 'kevinmorenom' })).json();
    expect(body).toMatchObject({ days: 1, next: '2026-11-03', newest: '2026-11-02' });
    expect(t.saved[0].map((d) => d.date)).toEqual(['2026-11-02']);
  });

  it('refuses a bad ID, a missing or private profile, and read-only previews', async () => {
    expect((await setup([]).post({ user: '../x' })).status).toBe(400);
    expect((await setup([]).post({ user: 'k', from: 'yesterday' })).status).toBe(400);
    expect((await setup([], {}).post({ user: 'nobody' })).status).toBe(404);
    expect((await setup([], { item: { privacySettings: { streams: false } } }).post({ user: 'k' })).status).toBe(409);
    const ro = setup([stream('2026-11-03T10:00:00Z', 1, [10])], undefined, true);
    expect((await ro.post({ user: 'k' })).status).toBe(409);
    expect(ro.saved).toEqual([]);
  });
});
