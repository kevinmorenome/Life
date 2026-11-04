import { describe, expect, it } from 'vitest';
import { guessKind, handleTripit, plansFromFeed, validateFeedUrl, type Connection, type TripitPlan, type TripitStore } from './tripit';

const FEED = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT', 'UID:f1@tripit.com', 'SUMMARY:Flight to Lisbon (TP 1234)', 'DTSTART;TZID=Europe/Zagreb:20261105T093000', 'DTEND;TZID=Europe/Lisbon:20261105T113000', 'LOCATION:Zagreb Airport', 'DESCRIPTION:Trip: Lisbon weekend\\nSeat 12A', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:h1@tripit.com', 'SUMMARY:Hotel Avenida', 'DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261108', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function fakeStore(): TripitStore & { saved: TripitPlan[][]; conn: Connection | null; stored: Map<string, string> } {
  const s = {
    saved: [] as TripitPlan[][],
    conn: null as Connection | null,
    stored: new Map<string, string>(),
    async get() {
      return s.conn;
    },
    async connect(url: string) {
      s.conn = { url, lastSync: null };
    },
    async existing() {
      return s.stored;
    },
    async savePlans(plans: TripitPlan[]) {
      s.saved.push(plans);
      for (const p of plans) s.stored.set(p.id, JSON.stringify(p));
    },
    async disconnect() {
      s.conn = null;
    },
  };
  return s;
}

const ctx = (store: TripitStore, fetchImpl: typeof fetch, readOnly = false) => ({ store, readOnly, now: new Date('2026-11-04T10:00:00Z'), fetch: fetchImpl });
const feedFetch = (body = FEED, status = 200): typeof fetch => (async () => new Response(body, { status })) as typeof fetch;
const post = (path: string, body?: unknown) =>
  new Request(`https://x/api/tripit/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

describe('validateFeedUrl', () => {
  it('accepts TripIt feed links, including webcal', () => {
    expect(validateFeedUrl('https://www.tripit.com/feed/ical/private/ABC/tripit.ics')).toBe('https://www.tripit.com/feed/ical/private/ABC/tripit.ics');
    expect(validateFeedUrl(' webcal://www.tripit.com/feed/ical/private/ABC/tripit.ics ')).toBe('https://www.tripit.com/feed/ical/private/ABC/tripit.ics');
  });
  it('refuses other hosts, schemes and paths', () => {
    for (const bad of ['http://www.tripit.com/feed/ical/x', 'https://evil.example/feed/ical/x', 'https://www.tripit.com.evil.example/feed/ical/x', 'https://www.tripit.com/account', 'https://u:p@www.tripit.com/feed/ical/x', 'nonsense', 5, undefined]) {
      expect(validateFeedUrl(bad)).toBeNull();
    }
  });
});

describe('plans', () => {
  it('guesses a kind from the words, else other', () => {
    expect(guessKind({ summary: 'Flight to Lisbon' })).toBe('flight');
    expect(guessKind({ summary: 'Hotel Avenida' })).toBe('lodging');
    expect(guessKind({ summary: 'Train to Porto' })).toBe('transit');
    expect(guessKind({ summary: 'Pickup: Hertz' })).toBe('car');
    expect(guessKind({ summary: 'Dinner at Belcanto' })).toBe('meal');
    expect(guessKind({ summary: 'Something' })).toBe('other');
  });

  it('builds records with stable ids and a trip name from the text', () => {
    const plans = plansFromFeed(FEED);
    // All-day events sort before timed ones on the same day.
    expect(plans.map((p) => p.id)).toEqual(['tripit-h1_tripit.com', 'tripit-f1_tripit.com']);
    expect(plans[1]).toMatchObject({ kind: 'flight', start: '2026-11-05', startTime: '09:30', tripName: 'Lisbon weekend', location: 'Zagreb Airport' });
    expect(plans[0]).toMatchObject({ kind: 'lodging', allDay: true, start: '2026-11-05', end: '2026-11-07' });
  });

  it('does not return the same event twice', () => {
    expect(plansFromFeed(FEED.replace('END:VCALENDAR', FEED.split('\r\n').slice(1, 3).join('\r\n') + '\r\nEND:VEVENT\r\nEND:VCALENDAR')).length).toBe(2);
  });
});

describe('handleTripit', () => {
  it('connects with a valid link, after checking that it gives a calendar', async () => {
    const store = fakeStore();
    const res = await handleTripit(post('connect', { url: 'https://www.tripit.com/feed/ical/private/ABC/tripit.ics' }), '/api/tripit/connect', ctx(store, feedFetch()));
    expect(res.status).toBe(200);
    expect(store.conn?.url).toBe('https://www.tripit.com/feed/ical/private/ABC/tripit.ics');
  });

  it('refuses a link that is not TripIt, or does not give a calendar', async () => {
    const store = fakeStore();
    expect((await handleTripit(post('connect', { url: 'https://evil.example/feed/ical/x' }), '/api/tripit/connect', ctx(store, feedFetch()))).status).toBe(400);
    expect((await handleTripit(post('connect', { url: 'https://www.tripit.com/feed/ical/x' }), '/api/tripit/connect', ctx(store, feedFetch('<html>'))) ).status).toBe(409);
    expect((await handleTripit(post('connect', { url: 'https://www.tripit.com/feed/ical/x' }), '/api/tripit/connect', ctx(store, feedFetch('', 404)))).status).toBe(409);
    expect(store.conn).toBeNull();
  });

  it('writes plans once, then only what changed', async () => {
    const store = fakeStore();
    store.conn = { url: 'https://www.tripit.com/feed/ical/x', lastSync: null };
    const first = await (await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch()))).json();
    expect(first).toEqual({ ok: true, plans: 2, changed: 2 });
    const second = await (await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch()))).json();
    expect(second).toEqual({ ok: true, plans: 2, changed: 0 });
    const moved = FEED.replace('Hotel Avenida', 'Hotel Avenida Lisboa');
    const third = await (await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch(moved)))).json();
    expect(third).toEqual({ ok: true, plans: 2, changed: 1 });
  });

  it('needs a connection to sync, never follows redirects blindly, and is read only in previews', async () => {
    const store = fakeStore();
    expect((await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch()))).status).toBe(409);
    store.conn = { url: 'https://www.tripit.com/feed/ical/x', lastSync: null };
    const redirected = (async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example' } })) as typeof fetch;
    const res = await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, redirected));
    expect(res.status).toBe(409);
    expect((await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch(), true))).status).toBe(409);
    const status = await handleTripit(new Request('https://x/api/tripit/status'), '/api/tripit/status', ctx(store, feedFetch(), true));
    expect(await status.json()).toEqual({ connected: true, lastSync: null });
  });

  it('disconnects', async () => {
    const store = fakeStore();
    store.conn = { url: 'u', lastSync: null };
    await handleTripit(post('disconnect'), '/api/tripit/disconnect', ctx(store, feedFetch()));
    expect(store.conn).toBeNull();
  });
});
