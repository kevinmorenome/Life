import { useEffect, useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { outfitName } from '../clothes/outfits';
import type { ClothingItem, Outfit, Plan } from '../clothes/types';
import { CheckIcon, EyeOffIcon, UndoIcon } from '../../icons';
import { packingList, tripDays } from './packing';
import type { Trip } from './types';

interface Props {
  trips: Trip[];
  items: ClothingItem[];
  outfits: Outfit[];
  plans: Plan[];
  /** Trips found in your Swarm check-ins that you haven't added or dismissed. */
  suggestions?: Trip[];
  onAddSuggestion?: (trip: Trip) => void | Promise<unknown>;
  onDismissSuggestion?: (trip: Trip) => void | Promise<unknown>;
  /** Suggestions you hid, listed so a slip can be undone. */
  hidden?: Trip[];
  onRestoreSuggestion?: (trip: Trip) => void | Promise<unknown>;
}

export function TripList({ trips, items, outfits, plans, suggestions = [], onAddSuggestion, onDismissSuggestion, hidden = [], onRestoreSuggestion }: Props) {
  const [toast, setToast] = useState<Trip | null>(null);
  // The Undo toast goes away by itself.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);
  const now = today();
  const upcoming = trips.filter((t) => t.endDate >= now).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = trips.filter((t) => t.endDate < now).sort((a, b) => b.startDate.localeCompare(a.startDate));

  const suggestionRow = (t: Trip, buttons: React.ReactNode) => {
    const days = tripDays(t).length;
    return (
      <li key={t.id} className="suggest-row">
        <div className="suggest-text">
          <strong>{t.name}</strong>
          <span className="muted small">
            {[t.destination, `${shortDate(t.startDate)} – ${shortDate(t.endDate)}`, `${days} ${days === 1 ? 'day' : 'days'}`].filter(Boolean).join(' · ')}
          </span>
        </div>
        {buttons}
      </li>
    );
  };

  const section = (title: string, list: Trip[]) =>
    list.length > 0 && (
      <section>
        <h2>{title}</h2>
        <ul className="trip-list">
          {list.map((t) => {
            const { total, packedCount } = packingList(t, items, outfits, outfitName, plans);
            const nights = tripDays(t).length;
            return (
              <li key={t.id}>
                <a className={`card trip-card${t.photo ? ' has-photo' : ''}`} href={href(`/trips/${t.id}`)}>
                  {t.photo && <img className="trip-cover" src={t.photo} alt="" loading="lazy" />}
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
      {trips.length === 0 && suggestions.length === 0 && (
        <div className="empty">
          <p className="muted">No trips yet. Plan one, pick outfits for each day, and get a packing checklist.</p>
          <a className="btn btn-primary" href={href('/trips/new')}>
            Plan a trip
          </a>
        </div>
      )}
      {suggestions.length > 0 && (
        <section>
          <h2>Found in your check-ins</h2>
          <p className="muted small">You checked in outside your home country on these days. Add the ones that were trips.</p>
          <ul className="suggest-list">
            {suggestions.map((t) =>
              suggestionRow(
                t,
                <>
                  <button type="button" className="icon-btn" aria-label={`Add ${t.name} as a trip`} onClick={() => void onAddSuggestion?.(t)}>
                    <CheckIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Not a trip: hide ${t.name}`}
                    onClick={async () => {
                      await onDismissSuggestion?.(t);
                      setToast(t);
                    }}
                  >
                    <EyeOffIcon />
                  </button>
                </>,
              ),
            )}
          </ul>
        </section>
      )}
      {section('Upcoming', upcoming)}
      {section('Past', past)}
      {hidden.length > 0 && (
        <details className="suggest-hidden">
          <summary className="muted small">Hidden suggestions ({hidden.length})</summary>
          <ul className="suggest-list">
            {hidden.map((t) =>
              suggestionRow(
                t,
                <button type="button" className="icon-btn" aria-label={`Show ${t.name} in the suggestions again`} onClick={() => void onRestoreSuggestion?.(t)}>
                  <UndoIcon />
                </button>,
              ),
            )}
          </ul>
        </details>
      )}
      {toast && (
        <div className="food-toast" role="status">
          <span>Hid {toast.name}</span>
          <button
            type="button"
            onClick={async () => {
              await onRestoreSuggestion?.(toast);
              setToast(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
