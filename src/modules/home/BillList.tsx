import { useMemo, useState } from 'react';
import { PlusIcon, SearchIcon } from '../../icons';
import { money, shortDate } from '../../lib/format';
import { href } from '../../lib/router';
import { UNITS, UTILITY_NAMES, billTitle, isPaid, newestFirst, paidByOther, pendingBills, searchBills } from './bills';
import type { UtilityBill } from './types';

type Filter = 'all' | 'water' | 'gas' | 'pending';

/** The bills, newest first: what is pending and what the other person paid on top, then chips, a search and one row per bill. */
export function BillList({ bills }: { bills: UtilityBill[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);
  const pending = useMemo(() => pendingBills(bills), [bills]);
  const other = useMemo(() => paidByOther(bills), [bills]);
  const shown = useMemo(() => {
    const base = filter === 'all' ? bills : filter === 'pending' ? pending : bills.filter((b) => b.utility === filter);
    return searchBills(newestFirst(base), query);
  }, [bills, pending, filter, query]);
  const chips: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: bills.length },
    { id: 'water', label: 'Water', count: bills.filter((b) => b.utility === 'water').length },
    { id: 'gas', label: 'Gas', count: bills.filter((b) => b.utility === 'gas').length },
    { id: 'pending', label: 'Pending', count: pending.length },
  ];

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
      {pending.length > 0 && (
        <p className="bill-banner">
          <strong>{pending.length} pending</strong> · {money(pending.reduce((a, b) => a + b.amount, 0))} to pay
        </p>
      )}
      {other.bills > 0 && (
        <p className="muted small bill-other">
          The other person paid {money(other.total)} on {other.bills} bills (water {money(other.water)}, gas {money(other.gas)}). Kevin’s part: {money(other.kevinOwes)}.
        </p>
      )}
      <div className="books-chips" role="group" aria-label="Bills">
        {chips.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={filter === c.id} onClick={() => { setFilter(c.id); setLimit(40); }}>
            {c.label} <span className="chip-count">{c.count}</span>
          </button>
        ))}
      </div>
      <div className="books-bar">
        <label className="books-search">
          <SearchIcon />
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(40); }} placeholder="Search bills" aria-label="Search bills" />
        </label>
        <a className="icon-btn" href={href('/home/new')} aria-label="Add a bill"><PlusIcon /></a>
      </div>
      {shown.length === 0 ? (
        <p className="muted small">No bills match.</p>
      ) : (
        <ul className="bill-list">
          {shown.slice(0, limit).map((b) => (
            <li key={b.id}>
              <a href={href(`/home/${b.id}`)}>
                <span className="bill-name">
                  <strong>{billTitle(b)}</strong>
                  <span className="muted small">
                    {isPaid(b) ? `Paid ${shortDate(b.paidOn!)}` : 'Pending'}
                    {b.consumption !== undefined && ` · ${b.consumption} ${UNITS[b.utility]}${b.estimated ? ' (est.)' : ''}`}
                  </span>
                </span>
                <span className="bill-amount">{money(b.amount)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {shown.length > limit && <button type="button" className="btn" onClick={() => setLimit((l) => l + 40)}>Show more ({shown.length - limit})</button>}
      <p className="muted small">{UTILITY_NAMES.water} and {UTILITY_NAMES.gas.toLowerCase()} bills. Send Claude a photo or PDF of a new one to add it.</p>
    </>
  );
}
