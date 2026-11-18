import { useMemo, useState } from 'react';
import { shortDate } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import { Empty, HBars, Section, Tile, Toggle } from '../clothes/charts';
import type { ClothingItem, Outfit } from '../clothes/types';
import { reviewYears, yearReview, type Wearable } from './yearReview';
import type { Checkin } from './types';

const monthName = (ym: string) => new Date(ym + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' });
const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Stats → Places → Year: one year of check-ins, plus the pieces and outfits worn most that year. */
export function YearReviewTab({ checkins, now }: { checkins: Checkin[]; now: string }) {
  const clothes = useCollection<ClothingItem>('clothes').items;
  const outfits = useCollection<Outfit>('outfits').items;
  const pieces = useMemo<Wearable[]>(() => clothes.map((c) => ({ id: c.id, name: c.name, wears: c.wears })), [clothes]);
  const looks = useMemo<Wearable[]>(() => outfits.map((o) => ({ id: o.id, name: o.name, wears: o.wears })), [outfits]);
  const years = useMemo(() => reviewYears(checkins, [...pieces, ...looks]), [checkins, pieces, looks]);
  const [picked, setPicked] = useState(now.slice(0, 4));
  const year = years.includes(picked) ? picked : (years[0] ?? now.slice(0, 4));
  const r = useMemo(() => yearReview(checkins, year, pieces, looks), [checkins, year, pieces, looks]);
  const partial = year === now.slice(0, 4);

  return (
    <>
      {years.length > 1 && <Toggle label="Year" options={years.slice(0, 6).map((y) => ({ value: y, label: y }))} value={year} onChange={setPicked} />}
      {r.checkins === 0 && r.mostWornPieces.length === 0 ? (
        <Section title={year}>
          <Empty>Nothing in {year}.</Empty>
        </Section>
      ) : (
        <>
          <Section hero title={`Your ${year}${partial ? ' so far' : ''}`} value={String(r.checkins)} sentence={`${r.checkins === 1 ? 'check-in' : 'check-ins'} at ${r.places} ${r.places === 1 ? 'place' : 'places'}, ${r.newPlaces} new, over ${r.daysOut} days out.`}>
          <div className="tiles">
            <Tile value={String(r.places)} label="places" tone={1} />
            <Tile value={String(r.newPlaces)} label="new places" tone={2} />
            <Tile value={String(r.daysOut)} label="days out" tone={3} />
          </div>
          </Section>
          {r.checkins > 0 && (
            <Section title="Highlights" value={r.busiestMonth ? monthName(r.busiestMonth.month) : undefined} sentence={r.busiestMonth ? `was your busiest month, ${times(r.busiestMonth.count)} checked in.` : undefined} tone={2} note={partial ? 'The year so far.' : undefined}>
              <ul className="digest-list">
                {r.busiestMonth && (
                  <li>
                    <strong>Busiest month</strong> <span className="small">{monthName(r.busiestMonth.month)}, {times(r.busiestMonth.count)} checked in</span>
                  </li>
                )}
                {r.busiestDay && (
                  <li>
                    <strong>Busiest day</strong> <span className="small">{shortDate(r.busiestDay.date)}, {plural(r.busiestDay.count, 'check-in')}</span>
                  </li>
                )}
                {r.longestStreak.days > 1 && r.longestStreak.start && r.longestStreak.end && (
                  <li>
                    <strong>Longest streak</strong>{' '}
                    <span className="small">
                      {plural(r.longestStreak.days, 'day')} in a row, {shortDate(r.longestStreak.start)} – {shortDate(r.longestStreak.end)}
                    </span>
                  </li>
                )}
                {r.countries.length > 0 && (
                  <li>
                    <strong>{plural(r.countries.length, 'country', 'countries')}</strong>{' '}
                    <span className="small">
                      {r.countries.join(', ')}
                      {r.newCountries.length > 0 ? `. New this year: ${r.newCountries.join(', ')}` : ''}
                    </span>
                  </li>
                )}
              </ul>
            </Section>
          )}
          {r.topVenues.length > 0 && (
            <Section title="Top places" value={r.topVenues[0].name} sentence={`is where you went most, ${r.topVenues[0].count} check-ins.`} tone={0}>
              <HBars rows={r.topVenues.map((v) => ({ key: v.key, label: v.name, value: v.count, shown: String(v.count) }))} />
            </Section>
          )}
          {r.categories.length > 0 && (
            <Section title="Kinds of places" value={r.categories[0].name} sentence={`is the kind of place you checked in at most, ${r.categories[0].count}.`} tone={2}>
              <HBars rows={r.categories.map((c) => ({ key: c.name, label: c.name, value: c.count, shown: String(c.count) }))} color="var(--tone-purple)" />
            </Section>
          )}
          {r.cities.length > 0 && (
            <Section title="Cities" value={String(r.cities.length)} sentence={`${r.cities.length === 1 ? 'city' : 'cities'}. ${r.cities[0].name} leads with ${r.cities[0].count}.`} tone={1}>
              <HBars rows={r.cities.map((c) => ({ key: c.name, label: c.name, value: c.count, shown: String(c.count) }))} color="var(--tone-blue)" />
            </Section>
          )}
        </>
      )}
      {r.mostWornPieces.length > 0 && (
        <Section title="Most worn pieces" value={`${r.mostWornPieces[0].count}×`} sentence={`${r.mostWornPieces[0].name}, your most worn piece this year.`} tone={3} note="Days each piece was worn this year.">
          <HBars rows={r.mostWornPieces.map((p) => ({ key: p.id, label: p.name, value: p.count, shown: String(p.count) }))} color="var(--tone-orange)" />
        </Section>
      )}
      {r.mostWornOutfits.length > 0 && (
        <Section title="Most worn outfits" value={`${r.mostWornOutfits[0].count}×`} sentence={`${r.mostWornOutfits[0].name || 'An outfit'}, your most worn outfit this year.`} tone={4}>
          <HBars rows={r.mostWornOutfits.map((o) => ({ key: o.id, label: o.name, value: o.count, shown: String(o.count) }))} color="var(--tone-lime)" />
        </Section>
      )}
    </>
  );
}
