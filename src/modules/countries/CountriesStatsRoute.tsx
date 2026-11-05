import { useMemo, useState } from 'react';
import { TrashIcon } from '../../icons';
import { shortDate, today } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import { Empty, HBars, Section, Tile } from '../clothes/charts';
import type { Checkin } from '../checkins/types';
import type { Trip } from '../trips/types';
import { COUNTRIES, newVisit, parseCountryList, summarize, visitedCountries, visitsToImport, type CountryEntry } from './countries';
import type { CountryVisit } from './types';
import { WorldMap } from './WorldMap';

const SOURCE_LABEL = { swarm: 'Swarm', list: 'List', manual: 'Added by hand', trip: 'Trips' } as const;

const years = (e: CountryEntry) => (e.first && e.last && e.first.slice(0, 4) !== e.last.slice(0, 4) ? `${e.first.slice(0, 4)}–${e.last.slice(0, 4)}` : e.first?.slice(0, 4));

export function CountriesStatsRoute() {
  const checkins = useCollection<Checkin>('checkins');
  const visits = useCollection<CountryVisit>('countries');
  const trips = useCollection<Trip>('trips');
  const entries = useMemo(() => visitedCountries(checkins.items, visits.items, trips.items, today()), [checkins.items, visits.items, trips.items]);
  const summary = useMemo(() => summarize(entries), [entries]);
  const thisYear = today().slice(0, 4);

  if (checkins.loading || visits.loading || trips.loading) return <p className="muted">Loading…</p>;
  return (
    <>
      <p className="muted small">From your Swarm check-ins and trips, plus countries added by hand.</p>
      <div className="tiles">
        <Tile value={String(summary.visited)} label={summary.visited === 1 ? 'country' : 'countries'} tone={0} />
        <Tile value={`${Math.round(summary.share * 100)}%`} label="of the world" tone={1} />
        <Tile value={String(summary.continents.filter((c) => c.visited > 0).length)} label="of 7 continents" tone={2} />
        <Tile value={String(entries.filter((e) => e.last?.startsWith(thisYear)).length)} label={`visited in ${thisYear}`} tone={3} />
      </div>
      <Section title="Map">
        <WorldMap entries={entries} />
      </Section>
      {summary.visited > 0 && (
        <Section title="Continents">
          <HBars
            color="var(--tone-blue)"
            rows={summary.continents
              .filter((c) => c.visited > 0)
              .map((c) => ({ key: c.name, label: c.name, value: c.visited / c.total, shown: `${c.visited} of ${c.total}` }))}
          />
        </Section>
      )}
      <Section title="Countries" note="Dates come from your Swarm check-ins; countries added from a list show no date until you set one.">
        {entries.length === 0 ? (
          <Empty>Nothing yet. Add a country or paste a list below, or fetch your Swarm check-ins in Settings.</Empty>
        ) : (
          <ul className="country-list">
            {entries.map((e) => (
              <CountryRow key={e.country.code} entry={e} onRemove={e.visit ? () => void visits.remove(e.visit!.id) : undefined} onDate={(d) => e.visit && void visits.save({ ...e.visit, firstVisit: d || undefined, updatedAt: new Date().toISOString() })} />
            ))}
          </ul>
        )}
      </Section>
      {summary.newPerYear.length > 0 && (
        <Section title="New countries per year">
          <HBars color="var(--tone-purple)" rows={summary.newPerYear.map((y) => ({ key: y.year, label: y.year, value: y.count, shown: String(y.count) }))} />
        </Section>
      )}
      <AddCountries entries={entries} existing={visits.items} onSave={(v) => visits.save(v)} />
    </>
  );
}

function CountryRow({ entry: e, onRemove, onDate }: { entry: CountryEntry; onRemove?: () => void; onDate: (date: string) => void }) {
  const [open, setOpen] = useState(false);
  const detail = [
    e.country.continent,
    e.first ? `first ${shortDate(e.first)}` : 'date unknown',
    e.checkins ? `${e.checkins} check-in${e.checkins === 1 ? '' : 's'}` : undefined,
  ].filter(Boolean);
  return (
    <li className="country-row">
      <div className="country-head">
        <button type="button" className="country-main" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="country-name">{e.country.name}</span>
          <span className="muted small">{years(e) ?? ''}</span>
        </button>
        {onRemove && (
          <button type="button" className="icon-btn" aria-label={`Remove ${e.country.name} from the list`} onClick={onRemove}>
            <TrashIcon />
          </button>
        )}
      </div>
      {open && (
        <div className="country-detail muted small">
          <p>{detail.join(' · ')}</p>
          {e.last && e.last !== e.first && <p>Last check-in {shortDate(e.last)}</p>}
          <p>From: {e.sources.map((s) => SOURCE_LABEL[s]).join(', ')}</p>
          {e.visit && (
            <label className="field">
              <span>First visit (optional)</span>
              <input type="date" value={e.visit.firstVisit ?? ''} onChange={(ev) => onDate(ev.target.value)} />
            </label>
          )}
        </div>
      )}
    </li>
  );
}

function AddCountries({ entries, existing, onSave }: { entries: CountryEntry[]; existing: CountryVisit[]; onSave: (v: CountryVisit) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const have = new Set(entries.map((e) => e.country.code));
  const q = query.trim().toLowerCase();
  const matches = q ? COUNTRIES.filter((c) => !have.has(c.code) && c.name.toLowerCase().includes(q)).slice(0, 6) : [];

  const importList = async () => {
    const { found, unknown } = parseCountryList(text);
    const fresh = visitsToImport(found, existing).filter((v) => !have.has(v.id));
    for (const v of fresh) await onSave(v);
    const skipped = found.length - fresh.length;
    setText('');
    setMessage(
      [
        `Added ${fresh.length} ${fresh.length === 1 ? 'country' : 'countries'}.`,
        skipped ? `${skipped} already there.` : '',
        unknown.length ? `Not recognised: ${unknown.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  };

  return (
    <Section title="Add countries" note="Countries you check in at on Swarm are added by themselves. Use this for trips before Swarm or without check-ins.">
      <div className="field">
        <span>Add one</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Start typing a country" aria-label="Country name" />
      </div>
      {matches.length > 0 && (
        <>
          <label className="field">
            <span>First visit (optional)</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="chips" role="group" aria-label="Matching countries">
            {matches.map((c) => (
              <button
                key={c.code}
                type="button"
                className="chip"
                onClick={() => {
                  void onSave(newVisit(c.code, 'manual', date || undefined));
                  setQuery('');
                  setDate('');
                  setMessage(`Added ${c.name}.`);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}
      <label className="field">
        <span>Or paste a list, one country per line</span>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Austria\nCanada\n…'} />
      </label>
      <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => void importList()}>
        Add the list
      </button>
      {message && (
        <p className="muted small" role="status">
          {message}
        </p>
      )}
    </Section>
  );
}
