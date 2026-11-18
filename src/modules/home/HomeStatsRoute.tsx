import { useMemo, useState } from 'react';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import { Empty, HBars, ReadoutColumns, Section, Tile, Toggle, type Bar } from '../clothes/charts';
import { UNITS, UTILITIES, UTILITY_NAMES, billYears, consumptionSeries, eur as money, kevinShare, latestBill, monthlySpend, paidByOther, usualComparison, usualText, yearSummary } from './bills';
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
  // Total = what the bills say; mine = Kevin's part (half until the bills become his alone). Every cost on the page follows this switch and says which it is.
  const [mode, setMode] = useState<'total' | 'mine'>('total');
  const mine = mode === 'mine';
  const shown = useMemo(() => (mine ? bills.map((b) => ({ ...b, amount: kevinShare(b) })) : bills), [bills, mine]);
  const whose = mine ? 'your part' : 'total';
  const all = year === 'all';
  const scope = all ? '' : year; // '' matches every month
  const full = useMemo(() => yearSummary(bills, scope), [bills, scope]);
  const s = useMemo(() => yearSummary(shown, scope), [shown, scope]);
  // Up to the latest month that has a bill, so a year in progress doesn't end on empty months.
  const endMonth = useMemo(() => {
    const inYear = bills.filter((b) => b.month.startsWith(scope)).map((b) => b.month).sort();
    return inYear[inYear.length - 1] ?? `${year}-12`;
  }, [bills, scope, year]);
  const months = useMemo(() => monthlySpend(shown, endMonth, 12), [shown, endMonth]);
  const other = useMemo(() => paidByOther(bills), [bills]);
  const bars: Bar[] = months.map((m, i) => ({
    key: m.month,
    tick: i % 3 === 0 ? tick(m.month) : '',
    value: m.total,
    parts: [{ value: m.water, color: 'var(--tone-blue)' }, { value: m.gas, color: 'var(--tone-orange)' }],
  }));

  return (
    <>
      <div className="seg seg-sub" role="tablist" aria-label="Show costs as" style={{ ['--tabs' as string]: 2 }}>
        <button type="button" role="tab" aria-selected={!mine} onClick={() => setMode('total')}>Total bills</button>
        <button type="button" role="tab" aria-selected={mine} onClick={() => setMode('mine')}>My part</button>
      </div>
      <Toggle label="Period" options={[...years.map((y) => ({ value: y, label: y })), { value: 'all', label: 'All time' }]} value={year} onChange={setYear} />
      <Section
        hero
        className="no-rule"
        title={`${mine ? 'My part of the bills' : 'Total of the bills'}${all ? ', all time' : ` in ${year}`}`}
        value={eur0(s.total)}
        sentence={`on ${s.bills} bills; water ${eur0(s.water)}, gas ${eur0(s.gas)}. ${mine ? `The full bills add up to ${eur0(full.total)}` : `My part of it is ${eur0(full.kevin)}`}.`}
      >
        <div className="tiles">
          <Tile value={eur0(s.water)} label="water" tone={1} />
          <Tile value={eur0(s.gas)} label="gas" tone={3} />
        </div>
      </Section>
      <Section title={`Latest bills · ${whose}`} className="no-rule">
        <div className="tiles">
          {UTILITIES.map((u) => (
            <Latest key={u} utility={u} bills={shown} />
          ))}
        </div>
      </Section>
      <Section title={`Cost per month · ${whose}`} className="no-rule" note={`By the month each bill is for, water and gas together. ${mine ? 'Your part only.' : 'The full amount of the bills, not only your part.'}`} value={eur0(months[months.length - 1].total)} sentence={`${whose} in ${label(months[months.length - 1].month, true)}.`} tone={1}>
        <ReadoutColumns bars={bars} big={(b) => money(b.value)} small={(b) => `${label(b.key, true)} · ${whose}`} initial={months[months.length - 1].month} />
        <p className="chart-legend">
          <span><i style={{ background: 'var(--tone-blue)' }} />Water</span>
          <span><i style={{ background: 'var(--tone-orange)' }} />Gas</span>
        </p>
      </Section>
      {(['water', 'gas'] as Utility[]).map((u) => (
        <Consumption key={u} utility={u} bills={bills} />
      ))}
      {other.bills > 0 && (
        <Section title="Paid by the other person · total" value={money(other.total)} sentence={`on ${other.bills} bills, the full amount of each. Kevin’s part of it, what may have to be paid back, is ${money(other.kevinOwes)}.`} tone={2}>
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
      sentence={`on the latest bill (${label(latest.month, true)})${latest.estimated ? ', an estimate' : ''}${avg ? `. A ${unit} costs about ${money(avg)} on average on the full bill, fixed fees included` : ''}.`}
      tone={utility === 'water' ? 1 : 3}
      note="The last 12 bills that state a consumption. A bill after a real meter reading can include several months at once."
    >
      <ReadoutColumns bars={bars} color={utility === 'water' ? 'var(--tone-blue)' : 'var(--tone-orange)'} big={(b) => `${b.value} ${unit}`} small={(b) => label(b.key.slice(0, 7), true)} initial={bars[bars.length - 1].key} />
    </Section>
  );
}

/** The newest bill of one utility: amount, usage and how that compares with what is usual. */
function Latest({ utility, bills }: { utility: Utility; bills: UtilityBill[] }) {
  const b = latestBill(bills, utility);
  if (!b) return null;
  const usual = usualComparison(bills, b);
  const label = [`${UTILITY_NAMES[utility]}, ${new Date(`${b.month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}`, b.consumption !== undefined ? `${b.consumption} ${UNITS[utility]}${b.estimated ? ' (est.)' : ''}` : '', usual ? usualText(usual) : ''].filter(Boolean).join(' · ');
  return (
    <a className="home-link" href={href(`/home/${b.id}`)}>
      <Tile value={money(b.amount)} label={label} tone={utility === 'water' ? 1 : 3} />
    </a>
  );
}
