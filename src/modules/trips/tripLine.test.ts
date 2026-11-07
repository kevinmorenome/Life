import { describe, expect, it } from 'vitest';
import { checkinCountriesByDay, flagsOnDay, tripDayShape } from './tripLine';

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
});
