import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { addMonths, monthGrid } from '../clothes/calendar';
import { TargetCard, type Target } from './TargetCard';
import { monthSummary, type DayInfo } from './work';

interface Props {
  /** YYYY-MM; defaults to the current month. */
  month?: string;
  infos: Map<string, DayInfo>;
  target: Target;
}

export function MonthView({ month, infos, target }: Props) {
  const now = today();
  const ym = month ?? now.slice(0, 7);
  const [year, m] = ym.split('-').map(Number);
  const weeks = monthGrid(year, m);
  const summary = monthSummary(ym, infos, now);
  const title = new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  // Monday-first weekday names in the viewer's language (Jan 5, 2026 was a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 5 + i)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
  );

  return (
    <>
      <div className="month-nav">
        <a className="btn btn-ghost" href={href(`/work/calendar/${addMonths(ym, -1)}`)} aria-label="Previous month">
          ‹
        </a>
        <div className="month-title">
          <strong>{title}</strong>
        </div>
        <a className="btn btn-ghost" href={href(`/work/calendar/${addMonths(ym, 1)}`)} aria-label="Next month">
          ›
        </a>
      </div>
      {ym !== now.slice(0, 7) && (
        <p className="center">
          <a href={href('/work')} className="small">
            Back to this month
          </a>
        </p>
      )}

      <TargetCard summary={summary} target={target} past={ym < now.slice(0, 7)} />

      <div className="calendar work-cal" role="grid" aria-label={title}>
        <div className="calendar-row calendar-head" role="row">
          {weekdays.map((w) => (
            <span key={w} role="columnheader">
              {w}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="calendar-row" role="row">
            {week.map(({ date, inMonth }) => {
              const status = infos.get(date)?.status;
              return (
                <a
                  key={date}
                  role="gridcell"
                  href={href(`/work/day/${date}`)}
                  className={`calendar-day${inMonth ? '' : ' out'}${date === now ? ' today' : ''}${status ? ` work-${status}` : ''}`}
                  aria-label={`${date}${status ? `, ${STATUS_LABELS[status]}` : ''}`}
                >
                  <span className="day-num">{Number(date.slice(8))}</span>
                </a>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="work-legend small muted" aria-label="Legend">
        <li>
          <span className="work-dot work-office" /> Office
        </li>
        <li>
          <span className="work-dot work-home" /> Home
        </li>
        <li>
          <span className="work-dot work-off" /> Day off
        </li>
      </ul>
    </>
  );
}

export const STATUS_LABELS = { office: 'office', home: 'home', off: 'day off' } as const;
