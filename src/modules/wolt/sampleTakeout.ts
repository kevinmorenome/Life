import type { WoltOrder } from './types';

const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Made-up Wolt, Bolt Food and Uber Eats orders for trying out the calendar and Stats → Takeout in a PR
 * preview. Dates run back from `today`; ids are fixed so adding them twice changes nothing.
 */
export function sampleTakeoutOrders(now: Date, today: string): WoltOrder[] {
  const stamp = now.toISOString();
  const rows: [string, 'wolt' | 'bolt' | 'uber', string, number, string, number, string?][] = [
    // id, service, venue, days ago, time, total, currency
    ['1', 'wolt', "McDonald's - Rotor", 1, '21:40', 9.61],
    ['2', 'bolt', 'Pizzeria Karlo', 3, '19:15', 14.8],
    ['3', 'uber', 'Burger Bar - Centar', 4, '13:05', 11.5],
    ['4', 'wolt', 'Sushi Time', 6, '20:30', 27.9],
    ['5', 'bolt', "McDonald's - Zagreb", 9, '22:10', 8.9],
    ['6', 'uber', 'Pizzeria Karlo', 12, '18:50', 16.2],
    ['7', 'wolt', "McDonald's - Rotor", 15, '21:20', 10.4],
    ['8', 'wolt', 'Warsaw Pierogi', 20, '14:00', 62, 'PLN'],
    ['9', 'bolt', 'Sushi Time', 27, '20:05', 31.5],
    ['10', 'uber', 'Burger Bar - Centar', 33, '12:45', 12.3],
    ['11', 'wolt', 'Pizzeria Karlo', 41, '19:40', 15.1],
    ['12', 'bolt', "McDonald's - Rotor", 55, '23:00', 7.8],
    ['13', 'wolt', 'Sushi Time', 70, '20:15', 29.4],
    ['14', 'uber', 'Pizzeria Karlo', 90, '19:00', 17.0],
  ];
  return rows.map(([n, service, restaurant, ago, time, total, currency]) => ({
    id: `${service}-sample-${n}`,
    restaurant,
    date: addDays(today, -ago),
    time,
    total,
    currency: currency ?? 'EUR',
    ...(service === 'wolt' ? {} : { service }),
    createdAt: stamp,
    updatedAt: stamp,
  }));
}
