import { useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { addMonths } from '../clothes/calendar';
import { Donut, Empty, HBars, Heatmap, ReadoutColumns, Section, Tile, Toggle, type Bar } from '../clothes/charts';
import { arrivalBins, attendanceStreaks, dayGrid, filterRange, officeShare, statusCounts, timeExtremes, weeklyCounts } from './insights';
import { TargetCard, type Target } from './TargetCard';
import type { WorkStatus } from './types';
import { formatDuration, formatMinutes, monthHistory, monthSummary, targetProgress, timeStats, weekdaySplit, type DayInfo } from './work';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'trends', label: 'Trends' },
  { id: 'times', label: 'Times' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const COLORS: Record<WorkStatus, string> = {
  office: 'var(--accent)',
  home: 'var(--tone-blue)',
  trip: 'var(--tone-purple)',
  off: 'var(--muted)',
};
const NAMES: Record<WorkStatus, string> = { office: 'Office', home: 'Home', trip: 'Work trip', off: 'Day off' };

const monthName = (ym: string, style: 'short' | 'narrow' | 'long' = 'short') =>
  new Date(ym + '-01T00:00:00Z').toLocaleDateString(undefined, { month: style, timeZone: 'UTC' });

export function StatsView({ infos, target, tab: routeTab }: { infos: Map<string, DayInfo>; target: Target; tab?: string }) {
  const now = today();
  const tab: TabId = TABS.find((t) => t.id === routeTab)?.id ?? 'overview';

  return (
    <>
      <div className="seg seg-sub" role="tablist" aria-label="Work stats sections" style={{ ['--tabs' as string]: TABS.length }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`work-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="work-panel"
            // Replace, so going back doesn't walk through every tab switch.
            onClick={() => window.location.replace(href(`/stats/work/${t.id}`))}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="work-panel" role="tabpanel" aria-labelledby={`work-tab-${tab}`}>
        {tab === 'overview' && <Overview infos={infos} target={target} now={now} />}
        {tab === 'trends' && <Trends infos={infos} target={target} now={now} />}
        {tab === 'times' && <Times infos={infos} now={now} />}
      </div>
    </>
  );
}

/* Overview ------------------------------------------------------------ */

function Overview({ infos, target, now }: { infos: Map<string, DayInfo>; target: Target; now: string }) {
  const year = now.slice(0, 4);
  const c = statusCounts(infos, year);
  const share = officeShare(c.office, c.home);
  const arrival = timeStats(infos, year).arrive;
  const empty = infos.size === 0;

  return (
    <>
      <section className="card">
        <TargetCard summary={monthSummary(now.slice(0, 7), infos, now)} target={target} past={false} />
      </section>
      {empty ? (
        <Section title="Nothing yet">
          <Empty>Log office and home days on the calendar, or import your badge report in Settings, and the numbers build up here.</Empty>
        </Section>
      ) : (
        <>
          <Section
            hero
            title={`Office days in ${year}`}
            value={String(c.office)}
            sentence={`${c.office === 1 ? 'day' : 'days'} in the office against ${c.home} at home${share === undefined ? '' : `: ${share}% of your days in the office`}.`}
          >
            <div className="tiles">
              <Tile value={String(c.home)} label={`home days in ${year}`} tone={1} />
              <Tile value={arrival === undefined ? '–' : formatMinutes(arrival)} label="usual arrival at the office" tone={3} />
            </div>
          </Section>
          <SplitCard infos={infos} now={now} />
          <StreakCard infos={infos} now={now} />
          <CalendarCard infos={infos} now={now} />
        </>
      )}
    </>
  );
}

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

function SplitCard({ infos, now }: { infos: Map<string, DayInfo>; now: string }) {
  const [period, setPeriod] = useState('year');
  const prefix = period === 'month' ? now.slice(0, 7) : period === 'year' ? now.slice(0, 4) : '';
  const counts = statusCounts(infos, prefix);
  const slices = (['office', 'home', 'trip', 'off'] as WorkStatus[]).filter((s) => counts[s] > 0).map((s) => ({ name: NAMES[s], value: counts[s] }));
  const byName = (name: string) => COLORS[(Object.keys(NAMES) as WorkStatus[]).find((s) => NAMES[s] === name) ?? 'off'];
  return (
    <Section
      title="Where you work"
      value={slices.length ? String(slices.reduce((n, x) => n + x.value, 0)) : undefined}
      sentence={slices.length ? `days logged. Most were ${slices.slice().sort((a, b) => b.value - a.value)[0].name.toLowerCase()}.` : undefined}
      tone={0}
      note="Office, home, work trips and days off."
    >
      <Toggle label="Period" options={PERIODS} value={period} onChange={setPeriod} />
      {slices.length === 0 ? (
        <Empty>No days logged in this period.</Empty>
      ) : (
        <Donut slices={slices} unit="days" label="Days by where you worked" colorFor={byName} />
      )}
    </Section>
  );
}

function StreakCard({ infos, now }: { infos: Map<string, DayInfo>; now: string }) {
  const st = attendanceStreaks(infos, now);
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  return (
    <Section title="Streaks" value={days(st.office.current)} sentence={`in the office now. Longest office run ${days(st.office.longest)}; at home now ${days(st.home.current)}, longest ${days(st.home.longest)}.`} tone={0} note="Workdays in a row. Weekends, days off and work trips don’t break a streak; a workday with nothing logged does.">
      <div className="tiles">
        <Tile value={days(st.office.longest)} label="longest office run" tone={0} />
        <Tile value={days(st.home.current)} label="at home now" tone={1} />
        <Tile value={days(st.home.longest)} label="longest home run" tone={1} />
      </div>
    </Section>
  );
}

function CalendarCard({ infos, now }: { infos: Map<string, DayInfo>; now: string }) {
  const weeks = dayGrid(infos, now, 20).map((col) =>
    col.map((cell) => ({ date: cell.date, future: cell.future, on: !!cell.status, color: cell.status ? COLORS[cell.status] : undefined })),
  );
  return (
    <Section title="Last 20 weeks" value={String(weeks.flat().filter((c) => c.on).length)} sentence="days logged in the last 20 weeks." tone={2} note="Each column is a week, Monday at the top.">
      <div className="pair-legend">
        {(['office', 'home', 'trip', 'off'] as WorkStatus[]).map((s) => (
          <span key={s}>
            <span className="legend-dot" style={{ background: COLORS[s] }} />
            {NAMES[s]}
          </span>
        ))}
      </div>
      <Heatmap weeks={weeks} label="Where you worked each day, last 20 weeks" />
    </Section>
  );
}

/* Trends -------------------------------------------------------------- */

const METRICS = [
  { value: 'share', label: 'Office %' },
  { value: 'office', label: 'Office' },
  { value: 'home', label: 'Home' },
];

function Trends({ infos, target, now }: { infos: Map<string, DayInfo>; target: Target; now: string }) {
  if (infos.size === 0) {
    return (
      <Section title="Nothing yet">
        <Empty>Trends appear once some days are logged.</Empty>
      </Section>
    );
  }
  return (
    <>
      <MonthlyCard infos={infos} now={now} />
      <WeeklyCard infos={infos} now={now} />
      <WeekdayCard infos={infos} />
      <TargetHistoryCard infos={infos} target={target} now={now} />
    </>
  );
}

function MonthlyCard({ infos, now }: { infos: Map<string, DayInfo>; now: string }) {
  const [metric, setMetric] = useState('share');
  const rows = monthHistory(now.slice(0, 7), infos, 12);
  const value = (r: (typeof rows)[number]) => (metric === 'share' ? officeShare(r.office, r.home) ?? 0 : metric === 'office' ? r.office : r.home);
  const bars: Bar[] = rows.map((r) => ({ key: r.month, tick: monthName(r.month, 'narrow'), value: value(r) }));
  const fmt = (v: number) => (metric === 'share' ? `${v}%` : `${v} ${v === 1 ? 'day' : 'days'}`);
  return (
    <Section title="Month by month" value={fmt(value(rows[rows.length - 1]))} sentence={`${metric === 'share' ? 'in the office' : metric === 'office' ? 'office' : 'home'} this month.`} tone={metric === 'home' ? 1 : 0} note="The last 12 months.">
      <Toggle label="Show" options={METRICS} value={metric} onChange={setMetric} />
      <ReadoutColumns
        key={metric}
        bars={bars}
        color={metric === 'home' ? COLORS.home : COLORS.office}
        big={(b) => fmt(b.value)}
        small={(b) => `${monthName(b.key, 'long')} ${b.key.slice(0, 4)}`}
        initial={now.slice(0, 7)}
      />
    </Section>
  );
}

function WeeklyCard({ infos, now }: { infos: Map<string, DayInfo>; now: string }) {
  const rows = weeklyCounts(infos, now, 12);
  const bars: Bar[] = rows.map((r) => ({ key: r.start, tick: String(Number(r.start.slice(8))), value: r.office }));
  return (
    <Section title="Office days per week" value={String(rows.at(-1)?.office ?? 0)} sentence="office days this week." tone={0} note="Week by week, labelled with the Monday’s date.">
      <ReadoutColumns
        bars={bars}
        big={(b) => `${b.value} office ${b.value === 1 ? 'day' : 'days'}`}
        small={(b) => `Week of ${shortDate(b.key)}`}
        initial={rows.at(-1)?.start}
      />
    </Section>
  );
}

function WeekdayCard({ infos }: { infos: Map<string, DayInfo> }) {
  const names = Array.from({ length: 5 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 5 + i)).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' }),
  );
  const rows = weekdaySplit(infos).map((w, i) => ({
    key: names[i],
    label: names[i],
    value: officeShare(w.office, w.home) ?? 0,
    shown: w.office + w.home ? `${officeShare(w.office, w.home)}% office` : '–',
    sub: `${w.office} office · ${w.home} home`,
  }));
  return (
    <Section title="Which days you go in" value={names[rows.reduce((b, r, i) => (r.value > rows[b].value ? i : b), 0)]} sentence="is the weekday you most often go in." tone={0} note="Share of office days among office and home days, all time.">
      <HBars rows={rows} color={COLORS.office} />
    </Section>
  );
}

function TargetHistoryCard({ infos, target, now }: { infos: Map<string, DayInfo>; target: Target; now: string }) {
  const months = monthHistory(now.slice(0, 7), infos, 6);
  const rows = months.map((m) => {
    const p = targetProgress(monthSummary(m.month, infos, now), target.days, target.kind, target.extended);
    const noun = target.kind === 'min-office' ? 'office' : 'home';
    const state = p.met ? 'On target' : p.needsApproval ? 'Needs approval' : p.overExtended ? 'Over the limit' : 'Short';
    return {
      key: m.month,
      label: `${monthName(m.month, 'long')} ${m.month.slice(0, 4)}`,
      value: p.count,
      shown: `${p.count} of ${p.target} ${noun} days`,
      sub: state,
      color: p.met ? COLORS.office : 'var(--tone-orange)',
    };
  });
  return (
    <Section title="Against your target" value={`${rows.filter((r) => r.sub === 'On target').length} of ${rows.length}`} sentence="of the last months were on target." tone={0} note="Each month’s count against the number set in Settings.">
      <HBars rows={rows} />
    </Section>
  );
}

/* Times --------------------------------------------------------------- */

const DURATION_KINDS = [
  { value: 'office', label: 'Office' },
  { value: 'home', label: 'Home' },
];

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
];

const prettyDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Times({ infos, now }: { infos: Map<string, DayInfo>; now: string }) {
  const [mode, setMode] = useState('all');
  const [month, setMonth] = useState(now.slice(0, 7));
  const [from, setFrom] = useState(`${now.slice(0, 7)}-01`);
  const [to, setTo] = useState(now);

  const lo = from <= to ? from : to;
  const hi = from <= to ? to : from;
  const range =
    mode === 'month'
      ? { from: `${month}-01`, to: `${month}-31`, label: `${monthName(month, 'long')} ${month.slice(0, 4)}` }
      : mode === 'custom'
        ? { from: lo, to: hi, label: `${prettyDay(lo)} – ${prettyDay(hi)}` }
        : { from: undefined, to: undefined, label: 'All time' };
  const inRange = filterRange(infos, range.from, range.to);

  const all = timeStats(infos);
  const homeAll = timeStats(infos, '', 'home');
  const hasTimes = all.arrive !== undefined || all.leave !== undefined || homeAll.arrive !== undefined || homeAll.leave !== undefined;
  if (!hasTimes) {
    return (
      <Section title="No times yet">
        <Empty>
          Office times come from your badge report or the Shortcut. For home days, open a day on the calendar and enter when you started and finished.
        </Empty>
      </Section>
    );
  }

  const step = (n: number) => setMonth((m) => addMonths(m, n));
  return (
    <>
      <div className="work-range">
        <Toggle label="Range" options={RANGES} value={mode} onChange={setMode} />
        {mode === 'month' && (
          <div className="work-range-row">
            <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => step(-1)}>
              ‹
            </button>
            <strong>{range.label}</strong>
            <button type="button" className="icon-btn" aria-label="Next month" disabled={month >= now.slice(0, 7)} onClick={() => step(1)}>
              ›
            </button>
          </div>
        )}
        {mode === 'custom' && (
          <div className="work-range-row">
            <label>
              <span className="muted small">From</span>
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </label>
            <label>
              <span className="muted small">To</span>
              <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </label>
          </div>
        )}
      </div>
      <ArrivalCard infos={inRange} rangeLabel={range.label} />
      <AveragesCard infos={infos} inRange={inRange} rangeLabel={range.label} showAll={mode !== 'all'} />
      <ExtremesCard infos={inRange} rangeLabel={range.label} />
      <OnSiteCard infos={infos} now={now} />
    </>
  );
}

function ArrivalCard({ infos, rangeLabel }: { infos: Map<string, DayInfo>; rangeLabel: string }) {
  const bins = arrivalBins(infos);
  if (bins.length === 0) {
    return (
      <Section title="When you arrive">
        <Empty>No office arrivals in {rangeLabel}.</Empty>
      </Section>
    );
  }
  const bars: Bar[] = bins.map((b) => ({ key: b.start, tick: b.start.endsWith(':00') ? String(Number(b.start.slice(0, 2))) : '', value: b.count }));
  const end = (start: string) => formatMinutes(Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + 30);
  const total = bins.reduce((a, b) => a + b.count, 0);
  const top = bins.reduce((a, b) => (b.count > a.count ? b : a));
  return (
    <Section title="When you arrive" value={top.start} sentence={`is when you most often get to the office, ${top.start}–${end(top.start)}, in ${rangeLabel.toLowerCase()}.`} tone={0} note={`Office arrivals by half hour, ${rangeLabel}.`}>
      <ReadoutColumns
        key={rangeLabel}
        bars={bars}
        big={(b) => `${b.value} ${b.value === 1 ? 'day' : 'days'}`}
        small={(b) => `${b.key}–${end(b.key)} · ${Math.round((b.value / total) * 100)}%`}
        initial={top.start}
      />
    </Section>
  );
}

function OnSiteCard({ infos, now }: { infos: Map<string, DayInfo>; now: string }) {
  const [kind, setKind] = useState<'office' | 'home'>('office');
  const months = monthHistory(now.slice(0, 7), infos, 12).map((r) => r.month);
  const stats = months.map((m) => timeStats(infos, m, kind));
  const bars: Bar[] = months.map((m, i) => ({ key: m, tick: monthName(m, 'narrow'), value: Math.round(stats[i].duration ?? 0) }));
  const any = bars.some((b) => b.value > 0);
  return (
    <Section title="Length of the day" value={any ? formatDuration(bars[bars.length - 1].value || [...bars].reverse().find((b) => b.value)!.value) : undefined} sentence={`average ${kind === 'home' ? 'working from home' : 'at the office'}, latest month with data.`} tone={kind === 'home' ? 1 : 0} note="Average time between start and end, for each of the last 12 months.">
      <Toggle label="Where" options={DURATION_KINDS} value={kind} onChange={(v) => setKind(v as 'office' | 'home')} />
      {!any ? (
        <Empty>{kind === 'home' ? 'Enter start and end times on your home days to see this.' : 'No office days with both times yet.'}</Empty>
      ) : (
        <ReadoutColumns
          key={kind}
          bars={bars}
          color={kind === 'home' ? COLORS.home : COLORS.office}
          big={(b) => (b.value ? formatDuration(b.value) : 'No data')}
          small={(b) => `${monthName(b.key, 'long')} ${b.key.slice(0, 4)}`}
          initial={now.slice(0, 7)}
        />
      )}
    </Section>
  );
}

function AveragesCard({
  infos,
  inRange,
  rangeLabel,
  showAll,
}: {
  infos: Map<string, DayInfo>;
  inRange: Map<string, DayInfo>;
  rangeLabel: string;
  /** Add an all-time column next to the selected range. */
  showAll: boolean;
}) {
  const rows = (status: WorkStatus) => ({ range: timeStats(inRange, '', status), all: timeStats(infos, '', status) });
  const table = (label: string, r: ReturnType<typeof rows>) =>
    (r.range.arrive !== undefined || r.range.leave !== undefined) && (
      <>
        <h3 className="work-times-title">{label}</h3>
        <table className="work-times">
          <thead>
            <tr>
              <th />
              <th>{rangeLabel}</th>
              {showAll && <th>All time</th>}
            </tr>
          </thead>
          <tbody>
            <TimeRow label="Start" a={r.range.arrive} b={showAll ? r.all.arrive : null} format={formatMinutes} />
            <TimeRow label="End" a={r.range.leave} b={showAll ? r.all.leave : null} format={formatMinutes} />
            <TimeRow label="Length" a={r.range.duration} b={showAll ? r.all.duration : null} format={formatDuration} />
          </tbody>
        </table>
      </>
    );
  const office = table('At the office', rows('office'));
  const home = table('Working from home', rows('home'));
  return (
    <Section
      title="Averages"
      value={rows('office').range.arrive !== undefined ? formatMinutes(rows('office').range.arrive!) : rows('home').range.arrive !== undefined ? formatMinutes(rows('home').range.arrive!) : undefined}
      sentence={`is your average start in ${rangeLabel.toLowerCase()}.`}
      tone={3}
    >
      {office}
      {home}
      {!office && !home && <Empty>No times in {rangeLabel}.</Empty>}
    </Section>
  );
}

function ExtremesCard({ infos, rangeLabel }: { infos: Map<string, DayInfo>; rangeLabel: string }) {
  const x = timeExtremes(infos);
  if (!x.earliest && !x.latest && !x.longest) return null;
  return (
    <Section title="Records" value={x.longest ? formatDuration(x.longest.minutes) : x.earliest?.time} sentence={x.longest ? `is your longest day, on ${shortDate(x.longest.date)}.` : 'is your earliest start.'} tone={2} note={rangeLabel}>
      <ul className="work-records">
        {x.earliest && <Record label="Earliest start" value={x.earliest.time} date={x.earliest.date} />}
        {x.latest && <Record label="Latest finish" value={x.latest.time} date={x.latest.date} />}
        {x.longest && <Record label="Longest day" value={formatDuration(x.longest.minutes)} date={x.longest.date} />}
      </ul>
    </Section>
  );
}

function Record({ label, value, date }: { label: string; value: string; date: string }) {
  return (
    <li>
      <span>
        {label}
        <span className="muted small"> · {shortDate(date)}</span>
      </span>
      <strong>{value}</strong>
    </li>
  );
}

/** `b` is null when there's no second column. */
function TimeRow({ label, a, b, format }: { label: string; a?: number; b?: number | null; format: (n: number) => string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{a === undefined ? '–' : format(a)}</td>
      {b !== null && <td>{b === undefined ? '–' : format(b)}</td>}
    </tr>
  );
}
