import { dishKey } from './dishes';
import type { DishFeedback, OrderShare, TakeoutDetail, TakeoutItem, WoltOrder } from './types';
import { placeName, round2 } from './wolt';

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

// Menus for the sample venues: [printed name, price now]. Older orders cost a little less, so repeat dishes show a price change.
const MENUS: Record<string, [string, number][]> = {
  "McDonald's": [['Big Mac Menu', 8.4], ['McChicken', 4.2], ['Pomfrit veliki', 3.1]],
  'Pizzeria Karlo': [['Pizza Margherita', 9.5], ['Pizza Capricciosa', 11.2], ['Coca-Cola 0,33l', 2.6]],
  'Burger Bar': [['Classic Burger', 8.9], ['Pomfrit', 3.2]],
  'Sushi Time': [['California roll 8 kom', 9.9], ['Losos nigiri 6 kom', 12.5], ['Miso juha', 3.4]],
  'Warsaw Pierogi': [['Pierogi ruskie', 28]],
};

/** Item lines, likes and notes, and one "for someone else" line for the sample orders, so What I eat has something to show. */
export function sampleTakeoutExtras(orders: WoltOrder[], now: Date): { details: TakeoutDetail[]; feedback: DishFeedback[]; shares: OrderShare[] } {
  const stamp = now.toISOString();
  const seen = new Map<string, number>();
  const details: TakeoutDetail[] = [];
  const byDate = [...orders].sort((a, b) => a.date.localeCompare(b.date));
  for (const o of byDate) {
    const menu = MENUS[placeName(o.restaurant)];
    if (!menu) continue;
    const nth = seen.get(placeName(o.restaurant)) ?? 0;
    seen.set(placeName(o.restaurant), nth + 1);
    // Prices rise by 20 cents per earlier order of the same venue, newest order at the menu price.
    const total = byDate.filter((x) => placeName(x.restaurant) === placeName(o.restaurant)).length;
    const lift = (total - 1 - nth) * 0.2;
    const picks = menu.slice(0, nth % 2 === 0 ? menu.length : 2);
    const items: TakeoutItem[] = picks.map(([name, price], i) => {
      const unitPrice = round2(Math.max(0.5, price - lift));
      const qty = i === 0 && o.restaurant.includes('Sushi') ? 2 : 1;
      return { name, qty, unitPrice, linePrice: round2(unitPrice * qty), vat: 13 };
    });
    const itemsSubtotal = round2(items.reduce((s, i) => s + i.linePrice, 0));
    const fees = round2(o.total - itemsSubtotal);
    details.push({ id: `td-${o.id}`, orderId: o.id, items, itemsSubtotal, ...(fees > 0 ? { feesTotal: fees } : {}), paymentMethod: 'Card', orderType: 'Dostava', createdAt: stamp, updatedAt: stamp });
  }
  const fb = (venue: string, dish: string, verdict: DishFeedback['verdict'], note?: string): DishFeedback => ({ id: `dfb-sample-${dishKey(venue, dish)}`, key: dishKey(venue, dish), venue, dish, verdict, ...(note ? { note } : {}), at: stamp, createdAt: stamp, updatedAt: stamp });
  const feedback = [fb('Pizzeria Karlo', 'Pizza Margherita', 'liked', 'Thin crust, ask for extra basil'), fb('Sushi Time', 'Miso juha', 'disliked', 'Too salty'), fb("McDonald's", 'McChicken', 'meh')];
  // The first Sushi Time order: 2 rolls, one for a friend, and the miso soup was entirely theirs.
  const sushi = byDate.find((o) => o.restaurant.includes('Sushi'));
  const shares: OrderShare[] = sushi ? [{ id: 'os-sample-1', orderId: sushi.id, mine: { '0': 1, '2': 0 }, at: stamp, createdAt: stamp, updatedAt: stamp }] : [];
  return { details, feedback, shares };
}
