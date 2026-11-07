import { useMemo } from 'react';
import { useSettings } from '../../lib/settings';
import { useCollection } from '../../lib/useCollection';
import type { Checkin } from '../checkins/types';
import { COUNTRIES, countryByCode, homeCountry } from './countries';
import { flagEmoji } from './flag';

/** Settings: your home country. Calendar days with check-ins in another country show that country's flag. */
export function HomeCountrySection() {
  const checkins = useCollection<Checkin>('checkins');
  const { settings, update } = useSettings();
  const automatic = useMemo(() => homeCountry(checkins.items), [checkins.items]);
  const sorted = useMemo(() => [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)), []);
  const auto = automatic ? countryByCode(automatic) : undefined;

  return (
    <section className="card">
      <h2>Home country</h2>
      <p className="muted small">Time abroad that isn’t one of your trips is drawn like one on the calendar, with that country’s flag, from your check-ins.</p>
      <select
        className="input"
        aria-label="Home country"
        value={settings.homeCountry ?? ''}
        onChange={(e) => void update({ homeCountry: e.target.value || undefined })}
      >
        <option value="">{auto ? `Automatic: ${flagEmoji(auto.code)} ${auto.name}` : 'Automatic (from your check-ins)'}</option>
        {sorted.map((c) => (
          <option key={c.code} value={c.code}>
            {flagEmoji(c.code)} {c.name}
          </option>
        ))}
      </select>
    </section>
  );
}
