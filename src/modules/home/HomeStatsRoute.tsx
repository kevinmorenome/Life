import { useMemo, useState } from 'react';
import { today } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import { Empty, HBars, ReadoutColumns, Section, Tile, type Bar } from '../clothes/charts';
import { UNITS, UTILITY_NAMES, billYears, consumptionSeries, eur as money, monthlySpend, paidByOther, yearSummary } from './bills';
import type { Utility, UtilityBill } from './types';

const eur0 = (n: number) => `€${Math.round(n).toLocaleString()}`;
const label = (ym: string, long = false) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: long ? 'long' : 'short', year: long ? 'numeric' : undefined, timeZone: 'UTC' });
/** Short tick: the month, with the year on January so the axis stays on one line. */
const tick = (ym: string) => (ym.endsWith('-01') ? `${label(ym)} ${ym.slice(2, 4)}` : label(ym));

/** Stats → Home: spend per month and year, water and gas consumption, and what the other person paid. */
export function HomeStatsRoute() {
  const { items, loading } = useCollection<UtilityBill>('utilitybills');
  if (loading) return <p className="muted">Loading…</p>;
  if (items.length === 0) {
    return (
      <Section title="Nothing yet">
        <Empty>Send Claude a photo or PDF of a water or gas bill and the numbers build up here.</Empty>
      </Section>
    );
  }
  return <Loaded bills={items} />;
}

function Loaded({ bills }: { bills: UtilityBill[] }) {
  const years = useMemo(() => billYears(bills), [bills]);
  const [year, setYear] = useState(years.includes(today().slice(0, 4)) ? today().slice(0, 4) : years[0]);
  const s = useMemo(() => yearSummary(bills, year), [bills, year]);
  // Up to the latest month that has a bill, so a year in progress doesn't end on empty months.
  const endMonth = useMemo(() => {
    const inYear = bills.filter((b) => b.month.startsWith(year)).map((b) => b.month).sort();
    return inYear[inYear.length - 1] ?? `${year}-12`;
  }, [bills, year]);
  const months = useMemo(() => monthlySpend(bills, endMonth, 12), [bills, endMonth]);
  const other = useMemo(() => paidByOther(bills), [bills]);
  const bars: Bar[] = months.map((m, i) => ({ key: m.month, tick: i % 3 === 0 ? tick(m.month) : '', value: m.total }));

  return (
    <>
      <div className="chips" role="group" aria-label="Year">
        {years.map((y) => (
          <button key={y} type="button" className="chip" aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>
        ))}
      </div>
      <Section hero title={`Home bills in ${year}`} value={eur0(s.total)} sentence={`on ${s.bills} bills; water ${eur0(s.water)}, gas ${eur0(s.gas)}. Kevin’s part is ${eur0(s.kevin)}.`}>
        <div className="tiles">
          <Tile value={eur0(s.water)} label="water" tone={1} />
          <Tile value={eur0(s.gas)} label="gas" tone={3} />
        </div>
      </Section>
      <Section title="Cost per month" note="By the month each bill is for, water and gas together." value={eur0(months[months.length - 1].total)} sentence={`in ${label(months[months.length - 1].month, true)}.`} tone={1}>
        <ReadoutColumns bars={bars} big={(b) => money(b.value)} small={(b) => label(b.key, true)} initial={months[months.length - 1].month} />
      </Section>
      {(['water', 'gas'] as Utility[]).map((u) => (
        <Consumption key={u} utility={u} bills={bills} />
      ))}
      {other.bills > 0 && (
        <Section title="Paid by the other person" value={money(other.total)} sentence={`on ${other.bills} bills. Kevin’s part of it, what may have to be paid back, is ${money(other.kevinOwes)}.`} tone={2}>
          <HBars rows={[{ key: 'w', label: 'Water', value: other.water, shown: money(other.water), color: 'var(--tone-blue)' }, { key: 'g', label: 'Gas', value: other.gas, shown: money(other.gas), color: 'var(--tone-orange)' }]} />
        </Section>
      )}
    </>
  );
}

function Consumption({ utility, bills }: { utility: Utility; bills: UtilityBill[] }) {
  const unit = UNITS[utility];
  const points = useMemo(() => consumptionSeries(bills, utility), [bills, utility]);
  if (points.length === 0) return null;
  const last = points.slice(-12);
  const latest = points[points.length - 1];
  const bars: Bar[] = last.map((p, i) => ({ key: `${p.month}-${i}`, tick: i % 3 === 0 ? tick(p.month) : '', value: p.consumption }));
  const priced = points.filter((p) => p.perUnit !== undefined && p.consumption >= 5);
  const avg = priced.length ? priced.reduce((a, p) => a + p.amount, 0) / priced.reduce((a, p) => a + p.consumption, 0) : undefined;
  return (
    <Section
      title={`${UTILITY_NAMES[utility]} consumption`}
      value={`${latest.consumption} ${unit}`}
      sentence={`on the latest bill (${label(latest.month, true)})${latest.estimated ? ', an estimate' : ''}${avg ? `. A ${unit} costs about ${money(avg)} on average, fixed fees included` : ''}.`}
      tone={utility === 'water' ? 1 : 3}
      note="The last 12 bills that state a consumption. A bill after a real meter reading can include several months at once."
    >
      <ReadoutColumns bars={bars} color={utility === 'water' ? 'var(--tone-blue)' : 'var(--tone-orange)'} big={(b) => `${b.value} ${unit}`} small={(b) => label(b.key.slice(0, 7), true)} initial={bars[bars.length - 1].key} />
    </Section>
  );
}
