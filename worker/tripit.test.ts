import { describe, expect, it } from 'vitest';
import { guessKind, handleTripit, plansFromFeed, validateFeedUrl, type TripitPlan, type TripitStore } from './tripit';

const FEED = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT', 'UID:f1@tripit.com', 'SUMMARY:Flight to Lisbon (TP 1234)', 'DTSTART;TZID=Europe/Zagreb:20261105T093000', 'DTEND;TZID=Europe/Lisbon:20261105T113000', 'LOCATION:Zagreb Airport', 'DESCRIPTION:Trip: Lisbon weekend\\nSeat 12A', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:h1@tripit.com', 'SUMMARY:Hotel Avenida', 'DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261108', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function fakeStore(): TripitStore & { saved: TripitPlan[][]; stored: Map<string, string>; last: number | null } {
  const s = {
    saved: [] as TripitPlan[][],
    stored: new Map<string, string>(),
    last: null as number | null,
    async lastSync() {
      return s.last;
    },
    async existing() {
      return s.stored;
    },
    async savePlans(plans: TripitPlan[], now: number) {
      s.saved.push(plans);
      s.last = now;
      for (const p of plans) s.stored.set(p.id, JSON.stringify(p));
    },
  };
  return s;
}

const LINK = 'https://www.tripit.com/feed/ical/private/ABC/tripit.ics';
const ctx = (store: TripitStore, fetchImpl: typeof fetch, readOnly = false, link: string | null = LINK) => ({
  env: { TRIPIT_FEED_URL: link ?? undefined },
  store,
  readOnly,
  now: new Date('2026-11-04T10:00:00Z'),
  fetch: fetchImpl,
});
const feedFetch = (body = FEED, status = 200): typeof fetch => (async () => new Response(body, { status })) as typeof fetch;
const post = (path: string) => new Request(`https://x/api/tripit/${path}`, { method: 'POST' });

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
  it('reports what the feed holds, without its content', async () => {
    const store = fakeStore();
    const body = (await (await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch()))).json()) as { feed: unknown };
    expect(body.feed).toEqual({
      components: { VCALENDAR: 1, VEVENT: 2 },
      events: 2,
      usable: 2,
      cancelled: 0,
      unreadable: 0,
      firstEventProps: ['UID', 'SUMMARY', 'DTSTART;TZID', 'DTEND;TZID', 'LOCATION', 'DESCRIPTION'],
    });
    expect(JSON.stringify(body.feed)).not.toContain('Lisbon');
  });

  it('says whether the secret is set, never what it is', async () => {
    const store = fakeStore();
    const on = await handleTripit(new Request('https://x/api/tripit/status'), '/api/tripit/status', ctx(store, feedFetch()));
    expect(await on.json()).toEqual({ configured: true, lastSync: null });
    const off = await handleTripit(new Request('https://x/api/tripit/status'), '/api/tripit/status', ctx(store, feedFetch(), false, null));
    expect(await off.json()).toEqual({ configured: false, lastSync: null });
  });

  it('writes plans once, then only what changed', async () => {
    const store = fakeStore();
    const first = await (await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch()))).json();
    expect(first).toMatchObject({ ok: true, plans: 2, changed: 2 });
    const second = await (await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch()))).json();
    expect(second).toMatchObject({ ok: true, plans: 2, changed: 0 });
    const moved = FEED.replace('Hotel Avenida', 'Hotel Avenida Lisboa');
    const third = await (await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch(moved)))).json();
    expect(third).toMatchObject({ ok: true, plans: 2, changed: 1 });
    expect(store.last).toBe(new Date('2026-11-04T10:00:00Z').getTime());
  });

  it('asks for the secret when it is missing or is not a TripIt link', async () => {
    const store = fakeStore();
    expect((await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch(), false, null))).status).toBe(503);
    expect((await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch(), false, 'https://evil.example/feed/ical/x'))).status).toBe(503);
    expect(store.saved).toEqual([]);
  });

  it('refuses a link that does not give a calendar, and never follows redirects', async () => {
    const store = fakeStore();
    expect((await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch('<html>')))).status).toBe(409);
    expect((await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch('', 404)))).status).toBe(409);
    const redirected = (async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example' } })) as typeof fetch;
    expect((await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, redirected))).status).toBe(409);
    expect(store.saved).toEqual([]);
  });

  it('is read only in previews', async () => {
    const store = fakeStore();
    expect((await handleTripit(post('sync'), '/api/tripit/sync', ctx(store, feedFetch(), true))).status).toBe(409);
  });
});
