import { describe, expect, it } from 'vitest';
import { checkinCountriesByDay, countryChangedOn, countryOnDay, tripDayShape } from './tripLine';

// 2026-11-04 is a Wednesday, so the 9th is the next Monday.
const trip = { startDate: '2026-11-04', endDate: '2026-11-11' };

describe('tripDayShape', () => {
  it('starts at the number on the first day, and has the line all day after that, the last day too', () => {
    expect(tripDayShape(trip, '2026-11-04')).toMatchObject({ line: 'from', flag: true });
    expect(tripDayShape(trip, '2026-11-05')).toMatchObject({ line: 'through', flag: false });
    expect(tripDayShape(trip, '2026-11-11')).toMatchObject({ line: 'through', flag: false });
  });

  it('shows the flag again on the Monday where the next week\'s line begins', () => {
    expect(tripDayShape(trip, '2026-11-09')).toMatchObject({ line: 'through', flag: true });
    expect(tripDayShape(trip, '2026-11-08').flag).toBe(false);
  });

  it('has a dot behind the number on the first day and a dot at the end of the line on the last', () => {
    expect(tripDayShape(trip, '2026-11-04')).toMatchObject({ start: true, end: false });
    expect(tripDayShape(trip, '2026-11-07')).toMatchObject({ start: false, end: false });
    expect(tripDayShape(trip, '2026-11-11')).toMatchObject({ start: false, end: true });
  });

  it('gives a one-day trip its line, flag and both dots', () => {
    expect(tripDayShape({ startDate: '2026-11-04', endDate: '2026-11-04' }, '2026-11-04')).toEqual({ line: 'from', flag: true, start: true, end: true });
  });

  it('puts the flag on the last day when it is a Monday', () => {
    expect(tripDayShape({ startDate: '2026-11-07', endDate: '2026-11-09' }, '2026-11-09')).toMatchObject({ line: 'through', flag: true, end: true });
  });
});

// Mexico from the 18th to the 30th of September 2026, ending with a layover in Amsterdam.
const mexico = { startDate: '2026-09-18', endDate: '2026-09-30', country: 'MX', destination: 'Tulum' };
const ci = (date: string, country: string) => ({ date, country });

describe('checkinCountriesByDay', () => {
  it('takes the country with most check-ins that day, airports included', () => {
    const byDay = checkinCountriesByDay([ci('2026-09-30', 'Netherlands'), ci('2026-09-20', 'Mexico'), ci('2026-09-20', 'Mexico'), ci('2026-09-20', 'United States'), ci('2026-09-21', 'Nowhereland')]);
    expect(byDay.get('2026-09-30')).toBe('NL');
    expect(byDay.get('2026-09-20')).toBe('MX');
    expect(byDay.has('2026-09-21')).toBe(false);
  });
});

describe('the country of a trip day', () => {
  const byDay = checkinCountriesByDay([ci('2026-09-19', 'Mexico'), ci('2026-09-30', 'Netherlands')]);
  it("is where you checked in, else where the day before was, else the trip's own country", () => {
    expect(countryOnDay(mexico, '2026-09-18', byDay)).toBe('MX');
    expect(countryOnDay(mexico, '2026-09-25', byDay)).toBe('MX');
    expect(countryOnDay(mexico, '2026-09-30', byDay)).toBe('NL');
  });
  it('puts the flag on the first day you are somewhere else', () => {
    expect(countryChangedOn(mexico, '2026-09-30', byDay)).toBe(true);
    expect(tripDayShape(mexico, '2026-09-30', true).flag).toBe(true);
    expect(countryChangedOn(mexico, '2026-09-29', byDay)).toBe(false);
    expect(countryChangedOn(mexico, '2026-09-18', byDay)).toBe(false);
  });
  it("shows no change when the check-ins are all in the trip's country", () => {
    const same = checkinCountriesByDay([ci('2026-09-20', 'Mexico'), ci('2026-09-24', 'Mexico')]);
    expect(Array.from({ length: 13 }, (_, i) => countryChangedOn(mexico, `2026-09-${18 + i}`, same)).some(Boolean)).toBe(false);
  });
});
