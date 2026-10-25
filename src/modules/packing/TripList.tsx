import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { outfitName } from '../clothes/outfits';
import type { ClothingItem, Outfit } from '../clothes/types';
import { packingList, tripDays } from './packing';
import type { Trip } from './types';

interface Props {
  trips: Trip[];
  items: ClothingItem[];
  outfits: Outfit[];
}

export function TripList({ trips, items, outfits }: Props) {
  const now = today();
  const upcoming = trips.filter((t) => t.endDate >= now).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = trips.filter((t) => t.endDate < now).sort((a, b) => b.startDate.localeCompare(a.startDate));

  const section = (title: string, list: Trip[]) =>
    list.length > 0 && (
      <section>
        <h2>{title}</h2>
        <ul className="trip-list">
          {list.map((t) => {
            const { total, packedCount } = packingList(t, items, outfits, outfitName);
            const nights = tripDays(t).length;
            return (
              <li key={t.id}>
                <a className="card trip-card" href={href(`/packing/${t.id}`)}>
                  <strong>{t.name}</strong>
                  <span className="muted small">
                    {[t.destination, `${shortDate(t.startDate)} – ${shortDate(t.endDate)}`, `${nights} ${nights === 1 ? 'day' : 'days'}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="muted small">
                    {total === 0 ? 'Nothing to pack yet' : `${packedCount} of ${total} packed`}
                  </span>
                  {total > 0 && <progress max={total} value={packedCount} />}
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    );

  return (
    <>
      <h1 className="page-title">Trips</h1>
      {trips.length === 0 && (
        <div className="empty">
          <p className="muted">No trips yet. Plan one, pick outfits for each day, and get a packing checklist.</p>
          <a className="btn btn-primary" href={href('/packing/new')}>
            Plan a trip
          </a>
        </div>
      )}
      {section('Upcoming', upcoming)}
      {section('Past', past)}
    </>
  );
}
