import { useMemo, useState } from 'react';
import { PlusIcon } from '../../icons';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { Section, Tile } from '../clothes/charts';
import { UNITS, UTILITIES, UTILITY_NAMES, eur, isOverdue, isPaid, latestBill, monthRows, paidByOther, pendingBills, usualComparison, usualText } from './bills';
import type { Utility, UtilityBill } from './types';

const monthName = (ym: string, style: 'long' | 'short' = 'long') => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: style, timeZone: 'UTC' });
const monthTitle = (b: UtilityBill) => `${UTILITY_NAMES[b.utility]} · ${monthName(b.month)} ${b.month.slice(0, 4)}`;

/**
 * Home: what needs doing now (what is still to pay), how the latest water and gas bills compare with what is usual, and the bills by
 * month. The history and trends live in Stats → Home.
 */
export function BillList({ bills }: { bills: UtilityBill[] }) {
  const now = today();
  const pending = useMemo(() => pendingBills(bills), [bills]);
  const rows = useMemo(() => monthRows(bills), [bills]);
  const years = useMemo(() => [...new Set(rows.map((r) => r.month.slice(0, 4)))], [rows]);
  const [year, setYear] = useState(years[0]);
  const other = useMemo(() => paidByOther(bills), [bills]);
  const overdue = pending.filter((b) => isOverdue(b, now)).length;
  const toPay = pending.reduce((a, b) => a + b.amount, 0);

  if (bills.length === 0) {
    return (
      <section className="card">
        <h2>No bills yet</h2>
        <p className="muted small">Send Claude a photo or PDF of a water or gas bill and the figures are added here, or add one yourself.</p>
        <a className="btn btn-primary" href={href('/home/new')}>Add a bill</a>
      </section>
    );
  }
  return (
    <>
      {pending.length === 0 ? (
        <Section hero title="To pay" value="All paid up" sentence="Nothing to pay right now." />
      ) : (
        <Section hero title="To pay" value={eur(toPay)} sentence={`on ${pending.length} ${pending.length === 1 ? 'bill' : 'bills'}${overdue > 0 ? `, ${overdue} overdue` : ''}.`} tone={overdue > 0 ? 3 : 0}>
          <ul className="bill-list">
            {pending.slice(0, 4).map((b) => (
              <li key={b.id}>
                <a href={href(`/home/${b.id}`)}>
                  <span className="bill-name">
                    <strong>{monthTitle(b)}</strong>
                    <span className="muted small">{isOverdue(b, now) ? `Overdue since ${shortDate(b.due!)}` : b.due ? `Due ${shortDate(b.due)}` : 'Not paid yet'}</span>
                  </span>
                  <span className="bill-amount">{eur(b.amount)}</span>
                </a>
              </li>
            ))}
          </ul>
          {pending.length > 4 && <p className="muted small">and {pending.length - 4} more in the list below.</p>}
        </Section>
      )}

      <Section title="Latest bills">
        <div className="tiles">
          {UTILITIES.map((u) => (
            <Latest key={u} utility={u} bills={bills} />
          ))}
        </div>
      </Section>

      {other.bills > 0 && (
        <p className="muted small home-other">
          The other person paid {eur(other.total)} on {other.bills} bills. <a href={href('/stats/home')}>See Stats</a>
        </p>
      )}

      <Section title="By month">
      <div className="books-bar">
        <div className="books-chips" role="group" aria-label="Year">
          {years.map((y) => (
            <button key={y} type="button" className="chip" aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>
          ))}
        </div>
        <a className="icon-btn" href={href('/home/new')} aria-label="Add a bill"><PlusIcon /></a>
      </div>
      <ul className="bill-list">
        {rows.filter((r) => r.month.startsWith(year)).map((r) => (
          <li key={r.month} className="bill-month">
            <span className="bill-month-head">
              <span className="stat-kicker">{monthName(r.month)}</span>
              <span className="muted small">{eur(r.total)}</span>
            </span>
            <ul className="bill-sub">
              {[r.water, r.gas].map((b) =>
                b ? (
                  <li key={b.id}>
                    <a href={href(`/home/${b.id}`)}>
                      <span className={`bill-dot bill-dot-${b.utility}`} aria-hidden />
                      <span className="bill-name">
                        <strong>{UTILITY_NAMES[b.utility]}</strong>
                        <span className="muted small">
                          {[b.consumption !== undefined ? `${b.consumption} ${UNITS[b.utility]}${b.estimated ? ' (est.)' : ''}` : '', isPaid(b) ? '' : 'To pay'].filter(Boolean).join(' · ') || ' '}
                        </span>
                      </span>
                      <span className="bill-amount">{eur(b.amount)}</span>
                    </a>
                  </li>
                ) : null,
              )}
            </ul>
          </li>
        ))}
      </ul>
      </Section>
    </>
  );
}

/** The newest bill of one utility: amount, usage and how that compares with what is usual. */
function Latest({ utility, bills }: { utility: Utility; bills: UtilityBill[] }) {
  const b = latestBill(bills, utility);
  if (!b) return null;
  const usual = usualComparison(bills, b);
  const label = [`${UTILITY_NAMES[utility]}, ${monthName(b.month, 'short')}`, b.consumption !== undefined ? `${b.consumption} ${UNITS[utility]}${b.estimated ? ' (est.)' : ''}` : '', usual ? usualText(usual) : ''].filter(Boolean).join(' · ');
  return (
    <a className="home-link" href={href(`/home/${b.id}`)}>
      <Tile value={eur(b.amount)} label={label} tone={utility === 'water' ? 1 : 3} />
    </a>
  );
}
