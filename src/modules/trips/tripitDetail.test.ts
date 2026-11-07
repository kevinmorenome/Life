import { describe, expect, it } from 'vitest';
import { plansFromDetail } from './tripitDetail';

// Made up, in the shape of TripIt's answer for a trip.
const detail = {
  Trip: { id: '900', display_name: 'Eurotrip' },
  AirObject: {
    id: 'a1',
    Segment: [
      { id: 's1', StartDateTime: { date: '2022-09-23', time: '07:08:00' }, EndDateTime: { date: '2022-09-23', time: '12:10:00' }, start_airport_code: 'MEX', end_airport_code: 'FRA', start_city_name: 'Mexico City', end_city_name: 'Frankfurt', start_country_code: 'MX', end_country_code: 'DE', marketing_airline_code: 'LH', marketing_flight_number: '501' },
      { id: 's2', StartDateTime: { date: '2022-09-23', time: '15:00:00' }, EndDateTime: { date: '2022-09-23', time: '16:20:00' }, start_airport_code: 'FRA', end_airport_code: 'ZAG', start_country_code: 'DE', end_country_code: 'HR' },
    ],
  },
  LodgingObject: [
    { id: 'l1', display_name: 'my stay', supplier_name: 'Hotel Roma', StartDateTime: { date: '2022-10-02', time: '15:00:00' }, EndDateTime: { date: '2022-10-05', time: '11:00:00' }, Address: { city: 'Rome', country: 'IT', zip: '00100' } },
    { id: 'l2', display_name: 'Wien flat', StartDateTime: { date: '2022-10-05' }, EndDateTime: { date: '2022-10-08' }, Address: { city: 'Vienna', country: 'AT' } },
  ],
  ActivityObject: [{ id: 'x1', display_name: 'Colosseum', StartDateTime: { date: '2022-10-03', time: '09:00:00' }, EndDateTime: { date: '2022-10-03', time: '11:00:00' }, Address: { city: 'Rome', country: 'IT' } }],
  NoteObject: { id: 'n1', display_name: 'A note', StartDateTime: { date: '2022-10-03' } },
};

describe('plansFromDetail', () => {
  const plans = plansFromDetail(detail, 'trip-tripit-900');
  const byId = (s: string) => plans.find((p) => p.id.endsWith(s))!;

  it('makes one plan per flight leg, stay and activity, and none for notes', () => {
    expect(plans).toHaveLength(5);
    expect(plans.map((p) => p.kind).sort()).toEqual(['activity', 'flight', 'flight', 'lodging', 'lodging']);
    expect(plans.every((p) => p.tripRef === 'trip-tripit-900')).toBe(true);
  });

  it('gives a flight leg its route, times and both countries on their days', () => {
    expect(byId('a1-s1')).toMatchObject({
      title: 'MEX → FRA (LH501)',
      location: 'Mexico City → Frankfurt',
      start: '2022-09-23',
      startTime: '07:08',
      endTime: '12:10',
      allDay: false,
      stops: [
        { country: 'MX', date: '2022-09-23' },
        { country: 'DE', date: '2022-09-23' },
      ],
    });
    expect(byId('a1-s2').stops).toEqual([
      { country: 'DE', date: '2022-09-23' },
      { country: 'HR', date: '2022-09-23' },
    ]);
  });

  it('puts a stay in its country on the first and the last day, named after the hotel', () => {
    expect(byId('l1')).toMatchObject({ title: 'Hotel Roma', location: 'Rome, Italy', start: '2022-10-02', end: '2022-10-05' });
    expect(byId('l1').stops).toEqual([
      { country: 'IT', date: '2022-10-02' },
      { country: 'IT', date: '2022-10-05' },
    ]);
    // No time means an all-day plan; the name falls back to display_name.
    expect(byId('l2')).toMatchObject({ title: 'Wien flat', allDay: true });
  });

  it('gives an activity its country on its day', () => {
    expect(byId('x1').stops).toEqual([{ country: 'IT', date: '2022-10-03' }]);
  });

  it('has stable ids, and nothing from a plan without a date or with an unknown country', () => {
    expect(plansFromDetail(detail, 'trip-tripit-900').map((p) => p.id)).toEqual(plans.map((p) => p.id));
    const odd = plansFromDetail({ Trip: { id: '1' }, ActivityObject: [{ id: 'a', display_name: 'No date' }, { id: 'b', StartDateTime: { date: '2022-10-03' }, Address: { country: 'ZZ' } }] }, 't');
    expect(odd).toHaveLength(1);
    expect(odd[0].stops).toBeUndefined();
  });

  it('reads a single object and an array the same way', () => {
    const one = plansFromDetail({ Trip: { id: '1' }, LodgingObject: { id: 'l', StartDateTime: { date: '2022-10-02' }, EndDateTime: { date: '2022-10-03' }, Address: { country: 'IT' } } }, 't');
    const many = plansFromDetail({ Trip: { id: '1' }, LodgingObject: [{ id: 'l', StartDateTime: { date: '2022-10-02' }, EndDateTime: { date: '2022-10-03' }, Address: { country: 'IT' } }] }, 't');
    expect(one).toEqual(many);
  });
});

describe('a restaurant', () => {
  // TripIt gives a restaurant one DateTime (no start and end) and an Address; made up, in that shape.
  const restaurant = {
    id: 'r1',
    display_name: 'Cafe Example Lisboa',
    supplier_name: 'Cafe Example Lisboa',
    DateTime: { date: '2026-05-10', time: '10:00:00', timezone: 'Europe/Lisbon' },
    Address: { city: 'Lisboa', country: 'PT', zip: '1100-585' },
  };

  it('is a meal at its time, in its country on that day', () => {
    const [p] = plansFromDetail({ Trip: { id: '5' }, RestaurantObject: restaurant }, 't');
    expect(p).toMatchObject({ kind: 'meal', title: 'Cafe Example Lisboa', location: 'Lisboa, Portugal', start: '2026-05-10', startTime: '10:00', end: '2026-05-10', allDay: false });
    expect(p.stops).toEqual([{ country: 'PT', date: '2026-05-10' }]);
  });

  it('reads several restaurants in an array', () => {
    const plans = plansFromDetail({ Trip: { id: '5' }, RestaurantObject: [restaurant, { ...restaurant, id: 'r2', DateTime: { date: '2026-05-11', time: '20:30:00' } }] }, 't');
    expect(plans.map((p) => p.start)).toEqual(['2026-05-10', '2026-05-11']);
  });
});
