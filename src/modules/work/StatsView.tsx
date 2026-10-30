import { today } from '../../lib/format';
import { TargetCard, type Target } from './TargetCard';
import { formatDuration, formatMinutes, monthHistory, monthSummary, timeStats, weekdaySplit, type DayInfo } from './work';

export function StatsView({ infos, target }: { infos: Map<string, DayInfo>; target: Target }) {
  const now = today();
  const ym = now.slice(0, 7);
  const history = monthHistory(ym, infos, 6);
  const biggest = Math.max(1, ...history.map((r) => r.office + r.home));
  const year = ym.slice(0, 4);
  const week = weekdaySplit(infos, year);
  const weekMax = Math.max(1, ...week.map((w) => w.office + w.home));
  const weekdayNames = Array.from({ length: 5 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 5 + i)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
  );
  const month = timeStats(infos, ym);
  const all = timeStats(infos);
  const homeMonth = timeStats(infos, ym, 'home');
  const homeAll = timeStats(infos, '', 'home');
  const hasHomeTimes = homeAll.arrive !== undefined || homeAll.leave !== undefined;

  return (
    <div className="work-stats">
      <TargetCard summary={monthSummary(ym, infos, now)} target={target} past={false} />

      <h2>Last 6 months</h2>
      <ul className="work-history">
        {history.map((r) => (
          <li key={r.month}>
            <span className="small muted">{new Date(r.month + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short' })}</span>
            <span className="work-stack" role="img" aria-label={`${r.office} office, ${r.home} home`}>
              <span className="work-office" style={{ width: `${(r.office / biggest) * 100}%` }} />
              <span className="work-home" style={{ width: `${(r.home / biggest) * 100}%` }} />
            </span>
            <span className="small">
              {r.office} · {r.home}
            </span>
          </li>
        ))}
      </ul>
      <p className="small muted">Office · Home days per month.</p>

      <h2>{year} by weekday</h2>
      <ul className="work-history">
        {week.map((w, i) => (
          <li key={weekdayNames[i]}>
            <span className="small muted">{weekdayNames[i]}</span>
            <span className="work-stack" role="img" aria-label={`${w.office} office, ${w.home} home`}>
              <span className="work-office" style={{ width: `${(w.office / weekMax) * 100}%` }} />
              <span className="work-home" style={{ width: `${(w.home / weekMax) * 100}%` }} />
            </span>
            <span className="small">
              {w.office} · {w.home}
            </span>
          </li>
        ))}
      </ul>

      <h2>Arriving and leaving</h2>
      {all.arrive === undefined && all.leave === undefined ? (
        <p className="muted small">Times appear once the Shortcut sends arrivals and departures.</p>
      ) : (
        <table className="work-times">
          <thead>
            <tr>
              <th />
              <th>This month</th>
              <th>All time</th>
            </tr>
          </thead>
          <tbody>
            <TimeRow label="Arrive" a={month.arrive} b={all.arrive} format={formatMinutes} />
            <TimeRow label="Leave" a={month.leave} b={all.leave} format={formatMinutes} />
            <TimeRow label="On site" a={month.duration} b={all.duration} format={formatDuration} />
          </tbody>
        </table>
      )}

      {hasHomeTimes && (
        <>
          <h2>Working from home</h2>
          <table className="work-times">
            <thead>
              <tr>
                <th />
                <th>This month</th>
                <th>All time</th>
              </tr>
            </thead>
            <tbody>
              <TimeRow label="Start" a={homeMonth.arrive} b={homeAll.arrive} format={formatMinutes} />
              <TimeRow label="End" a={homeMonth.leave} b={homeAll.leave} format={formatMinutes} />
              <TimeRow label="Worked" a={homeMonth.duration} b={homeAll.duration} format={formatDuration} />
            </tbody>
          </table>
          <p className="small muted">From the days where you entered start and end times.</p>
        </>
      )}
    </div>
  );
}

function TimeRow({ label, a, b, format }: { label: string; a?: number; b?: number; format: (n: number) => string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{a === undefined ? '–' : format(a)}</td>
      <td>{b === undefined ? '–' : format(b)}</td>
    </tr>
  );
}
