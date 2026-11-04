import { describe, expect, it } from 'vitest';
import { parseIcs } from './ics';

const wrap = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`;

describe('parseIcs', () => {
  it('reads a timed event with a time zone', () => {
    const [e] = parseIcs(
      wrap('BEGIN:VEVENT', 'UID:abc-1', 'SUMMARY:Flight to Lisbon', 'DTSTART;TZID=Europe/Zagreb:20261105T093000', 'DTEND;TZID=Europe/Lisbon:20261105T113000', 'LOCATION:Zagreb\\, Croatia', 'END:VEVENT'),
    );
    expect(e).toEqual({
      uid: 'abc-1',
      summary: 'Flight to Lisbon',
      start: '2026-11-05',
      startTime: '09:30',
      end: '2026-11-05',
      endTime: '11:30',
      allDay: false,
      tz: 'Europe/Zagreb',
      location: 'Zagreb, Croatia',
    });
  });

  it('takes the exclusive end off an all-day event', () => {
    const [e] = parseIcs(wrap('BEGIN:VEVENT', 'UID:h', 'SUMMARY:Hotel', 'DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261108', 'END:VEVENT'));
    expect(e).toMatchObject({ allDay: true, start: '2026-11-05', end: '2026-11-07' });
    expect(e.startTime).toBeUndefined();
  });

  it('keeps a one-day all-day event on its day', () => {
    const [e] = parseIcs(wrap('BEGIN:VEVENT', 'UID:h', 'SUMMARY:Day', 'DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261106', 'END:VEVENT'));
    expect(e).toMatchObject({ start: '2026-11-05', end: '2026-11-05' });
  });

  it('marks UTC times and unfolds long lines', () => {
    const [e] = parseIcs(
      wrap('BEGIN:VEVENT', 'UID:u', 'SUMMARY:Dinner at a very long', '  named restaurant', 'DTSTART:20261105T190000Z', 'DESCRIPTION:Line one\\nLine two\; ok', 'END:VEVENT'),
    );
    expect(e.summary).toBe('Dinner at a very long named restaurant');
    expect(e).toMatchObject({ tz: 'UTC', startTime: '19:00', description: 'Line one\nLine two; ok', end: '2026-11-05' });
  });

  it('skips cancelled events and ones without a UID, summary or start', () => {
    const events = parseIcs(
      wrap(
        'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Cancelled', 'DTSTART:20261105', 'STATUS:CANCELLED', 'END:VEVENT',
        'BEGIN:VEVENT', 'SUMMARY:No uid', 'DTSTART:20261105', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:b', 'DTSTART:20261105', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:c', 'SUMMARY:No start', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:d', 'SUMMARY:Fine', 'DTSTART:20261105', 'END:VEVENT',
      ),
    );
    expect(events.map((e) => e.uid)).toEqual(['d']);
  });

  it('survives quoted parameters containing a colon', () => {
    const [e] = parseIcs(wrap('BEGIN:VEVENT', 'UID:q', 'SUMMARY:X', 'DTSTART:20261105', 'ATTACH;FILENAME="a:b.pdf":http://x', 'URL:https://www.tripit.com/trip/show/id/1', 'END:VEVENT'));
    expect(e.url).toBe('https://www.tripit.com/trip/show/id/1');
  });

  it('returns nothing for text that is not a calendar', () => {
    expect(parseIcs('<html>nope</html>')).toEqual([]);
  });
});
