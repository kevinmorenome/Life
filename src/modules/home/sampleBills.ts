import type { Payer, UtilityBill } from './types';

const addMonths = (ym: string, n: number): string => {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Made-up water and gas bills for trying out Home bills in a PR preview: 14 months back from `today`, the gas following a heating
 * season, a few bills paid by "the other person", the newest water bill still pending. Ids are fixed so adding twice changes nothing.
 */
export function sampleBills(now: Date, today: string): UtilityBill[] {
  const stamp = now.toISOString();
  const thisMonth = today.slice(0, 7);
  const gasSm3 = [6, 5, 7, 9, 19, 45, 55, 70, 61, 31, 23, 14, 8, 6]; // oldest first, summer low, winter high
  const waterM3 = [11, 10, 12, 9, 11, 10, 12, 11, 10, 13, 11, 12, 10, 11];
  const bills: UtilityBill[] = [];
  let waterReading = 400;
  let gasReading = 300;
  for (let i = 0; i < 14; i++) {
    const month = addMonths(thisMonth, i - 13);
    const last = i === 13;
    const paidOn = `${addMonths(month, 1)}-${String(10 + (i % 15)).padStart(2, '0')}`;
    const paidBy: Payer = i >= 8 ? 'other' : i % 2 === 0 ? 'kevin' : 'felipe';
    const m3 = waterM3[i];
    const water = Math.round((m3 * 2.1 + 25.81) * 100) / 100;
    bills.push({
      id: `bill-water-sample-${month}`,
      utility: 'water',
      number: `5${month.replace('-', '')}`,
      month,
      amount: water,
      due: `${addMonths(month, 1)}-28`,
      ...(last || paidOn > today ? {} : { paidOn, paidBy }),
      consumption: m3,
      readingStart: waterReading,
      readingEnd: (waterReading += m3),
      lines: [
        { label: 'Water supply', amount: Math.round(m3 * 0.72 * 100) / 100, quantity: m3, unit: 'm³', unitPrice: 0.72 },
        { label: 'Drainage', amount: Math.round(m3 * 0.48 * 100) / 100, quantity: m3, unit: 'm³', unitPrice: 0.48 },
        { label: 'Treatment', amount: Math.round(m3 * 0.9 * 100) / 100, quantity: m3, unit: 'm³', unitPrice: 0.9 },
        { label: 'Fixed fee: supply, drainage, treatment', amount: 25.81 },
      ],
      createdAt: stamp,
      updatedAt: stamp,
    });
    const sm3 = gasSm3[i];
    bills.push({
      id: `bill-gas-sample-${month}`,
      utility: 'gas',
      number: `G${month.replace('-', '')}`,
      month,
      amount: Math.round((sm3 * 0.8 + 1.4) * 100) / 100,
      ...(paidOn > today ? {} : { paidOn, paidBy }),
      consumption: sm3,
      readingStart: gasReading,
      readingEnd: (gasReading += sm3),
      ...(i % 3 !== 0 ? { estimated: true } : {}),
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
  return bills;
}
