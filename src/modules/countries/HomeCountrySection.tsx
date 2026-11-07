import { useMemo } from 'react';
import { useSettings, type AppSettings } from '../../lib/settings';
import { useCollection } from '../../lib/useCollection';
import type { Checkin } from '../checkins/types';
import { COUNTRIES, countryByCode, homeCountry } from './countries';
import { flagEmoji } from './flag';

type Period = NonNullable<AppSettings['homePeriods']>[number];

/**
 * Settings: your home country, maybe over time. Home's flag is never drawn on the calendar, and time abroad that isn't
 * one of your trips is drawn like one (with that country's flag) from your check-ins.
 */
export function HomeCountrySection() {
  const checkins = useCollection<Checkin>('checkins');
  const { settings, update } = useSettings();
  const automatic = useMemo(() => homeCountry(checkins.items), [checkins.items]);
  const sorted = useMemo(() => [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)), []);
  const auto = automatic ? countryByCode(automatic) : undefined;
  const periods = settings.homePeriods ?? [];
  const setPeriods = (next: Period[]) => void update({ homePeriods: next.length ? next : undefined });
  const edit = (i: number, patch: Partial<Period>) => setPeriods(periods.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const options = sorted.map((c) => (
    <option key={c.code} value={c.code}>
      {flagEmoji(c.code)} {c.name}
    </option>
  ));

  return (
    <section className="card">
      <h2>Home country</h2>
      <p className="muted small">Its flag isn’t shown on the calendar. Time abroad that isn’t one of your trips is drawn like one, with that country’s flag, from your check-ins.</p>
      <select className="input" aria-label="Home country" value={settings.homeCountry ?? ''} onChange={(e) => void update({ homeCountry: e.target.value || undefined })}>
        <option value="">{auto ? `Automatic: ${flagEmoji(auto.code)} ${auto.name}` : 'Automatic (from your check-ins)'}</option>
        {options}
      </select>

      <h3 className="small">Lived somewhere else before?</h3>
      <p className="muted small">Add a period for each place you called home: it lasts until the next one starts. Leave the date empty for “from the beginning”. For example Mexico with no date, then Croatia from 1 July 2023. Days no period covers use the country above.</p>
      <ul className="home-periods">
        {periods.map((p, i) => (
          <li key={i}>
            <select className="input" aria-label="Country" value={p.country} onChange={(e) => edit(i, { country: e.target.value })}>
              {options}
            </select>
            <input className="input" type="date" aria-label="From (empty = from the beginning)" value={p.from ?? ''} onChange={(e) => edit(i, { from: e.target.value || undefined })} />
            <button type="button" className="icon-btn" aria-label="Remove this period" onClick={() => setPeriods(periods.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={() => setPeriods([...periods, { country: periods[periods.length - 1]?.country ?? automatic ?? 'US' }])}>
        Add a period
      </button>
    </section>
  );
}
