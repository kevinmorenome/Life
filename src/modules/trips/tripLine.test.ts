import { describe, expect, it } from 'vitest';
import { checkinCountriesByDay, flagsOnDay, flagsToShow, tripDayShape } from './tripLine';

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

// Mexico from the 18th to the 30th of September 2026 (a Friday to a Wednesday), ending with a layover in Amsterdam.
const mexico = { startDate: '2026-09-18', endDate: '2026-09-30', country: 'MX', destination: 'Tulum' };
const ci = (date: string, country: string, at = 0) => ({ date, country, at });

describe('checkinCountriesByDay', () => {
  it('lists the countries of the day in the order you were there, airports included', () => {
    const byDay = checkinCountriesByDay([ci('2026-09-30', 'Netherlands', 2), ci('2026-09-30', 'Mexico', 1), ci('2026-09-30', 'Mexico', 0), ci('2026-09-21', 'Nowhereland')]);
    expect(byDay.get('2026-09-30')).toEqual(['MX', 'NL']);
    expect(byDay.has('2026-09-21')).toBe(false);
  });
});

describe('flagsOnDay', () => {
  const byDay = checkinCountriesByDay([ci('2026-09-18', 'Mexico'), ci('2026-09-30', 'Mexico', 1), ci('2026-09-30', 'Netherlands', 2)]);
  it('shows the country on the first day', () => {
    expect(flagsOnDay(mexico, '2026-09-18', byDay)).toEqual(['MX']);
    expect(flagsOnDay(mexico, '2026-09-18', new Map())).toEqual(['MX']);
  });
  it('shows nothing on the days in between, and the flag again on a Monday', () => {
    expect(flagsOnDay(mexico, '2026-09-22', byDay)).toEqual([]);
    expect(flagsOnDay(mexico, '2026-09-21', byDay)).toEqual(['MX']);
  });
  it('adds the flag of a country you only passed through', () => {
    expect(flagsOnDay(mexico, '2026-09-30', byDay)).toEqual(['NL']);
  });
  it('shows every country of a first day or a Monday', () => {
    const two = checkinCountriesByDay([ci('2026-09-21', 'Mexico', 1), ci('2026-09-21', 'Netherlands', 2)]);
    expect(flagsOnDay(mexico, '2026-09-21', two)).toEqual(['MX', 'NL']);
  });
  it('shows the flag again when you come back after another country', () => {
    const back = checkinCountriesByDay([ci('2026-09-22', 'Netherlands'), ci('2026-09-23', 'Mexico')]);
    expect(flagsOnDay(mexico, '2026-09-22', back)).toEqual(['NL']);
    expect(flagsOnDay(mexico, '2026-09-23', back)).toEqual(['MX']);
  });
  it('shows no new flag when you cross the same border back and forth every day', () => {
    const commute = checkinCountriesByDay(
      [22, 23, 24, 25].flatMap((d) => [ci(`2026-09-${d}`, 'Mexico', 1), ci(`2026-09-${d}`, 'Belize', 2), ci(`2026-09-${d}`, 'Mexico', 3), ci(`2026-09-${d}`, 'Belize', 4)]),
    );
    expect(flagsOnDay(mexico, '2026-09-23', commute)).toEqual([]);
    expect(flagsOnDay(mexico, '2026-09-25', commute)).toEqual([]);
  });
  it('shows at most three flags', () => {
    const many = checkinCountriesByDay([ci('2026-09-21', 'Mexico', 1), ci('2026-09-21', 'Belize', 2), ci('2026-09-21', 'Guatemala', 3), ci('2026-09-21', 'Honduras', 4)]);
    expect(flagsOnDay(mexico, '2026-09-21', many)).toHaveLength(3);
  });
});

describe('flagsToShow', () => {
  it("leaves your home country's flag out of a trip abroad", () => {
    const by = checkinCountriesByDay([ci('2026-09-30', 'Mexico', 1), ci('2026-09-30', 'Croatia', 2)]);
    expect(flagsOnDay(mexico, '2026-09-30', by)).toEqual(['HR']);
    expect(flagsToShow(mexico, '2026-09-30', by, 'HR')).toEqual({ codes: [], unknown: false });
    expect(flagsToShow(mexico, '2026-09-18', new Map(), 'HR').codes).toEqual(['MX']);
  });
  it('keeps the flag for a trip within your home country', () => {
    const home = { startDate: '2026-09-18', endDate: '2026-09-30', country: 'HR', destination: 'Split' };
    expect(flagsToShow(home, '2026-09-18', new Map(), 'HR')).toEqual({ codes: ['HR'], unknown: false });
    expect(flagsToShow(home, '2026-09-21', new Map(), 'HR').codes).toEqual(['HR']);
  });
  it('draws a suitcase when no country is known', () => {
    expect(flagsToShow({ startDate: '2026-09-18', endDate: '2026-09-20' }, '2026-09-18', new Map())).toEqual({ codes: [], unknown: true });
  });
});

describe('checkinCountriesByDay with a skip', () => {
  it('leaves out the check-ins it is told to (those at home)', () => {
    const c = [{ date: '2026-09-30', country: 'Croatia', city: 'Zagreb', at: 2 }, { date: '2026-09-30', country: 'Croatia', city: 'Split', at: 1 }];
    expect(checkinCountriesByDay(c, (x) => x.city === 'Zagreb').get('2026-09-30')).toEqual(['HR']);
    expect(checkinCountriesByDay([c[0]], (x) => x.city === 'Zagreb').has('2026-09-30')).toBe(false);
  });
});
