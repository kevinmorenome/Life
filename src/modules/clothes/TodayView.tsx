import { useState } from 'react';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { wearsByDay } from './calendar';
import { ItemThumb } from './ItemThumb';
import { OutfitCollage } from './OutfitCollage';
import { outfitName, outfitPieces, wearOutfit } from './outfits';
import { missedDays, previousLoggedDay, repeatDay, suggestedOutfits } from './today';
import type { ClothingItem, Outfit } from './types';

interface Props {
  items: ClothingItem[];
  outfits: Outfit[];
  onSaveItem: (i: ClothingItem) => Promise<void>;
  onSaveOutfit: (o: Outfit) => Promise<void>;
}

const SKIPPED_KEY = 'life.clothes.skippedDays';

// Days dismissed from the catch-up list. Per device on purpose: it's a nag filter, not data.
function readSkipped(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SKIPPED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

const dayLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(date + 'T00:00:00').toLocaleDateString(undefined, options);

/** One-tap logging for today, plus a catch-up list for days that were forgotten. */
export function TodayView({ items, outfits, onSaveItem, onSaveOutfit }: Props) {
  const date = today();
  const [skipped, setSkipped] = useState(readSkipped);
  const wore = wearsByDay(items, outfits).get(date) ?? { outfits: [], items: [] };
  const logged = wore.outfits.length > 0 || wore.items.length > 0;

  const previous = logged ? null : previousLoggedDay(items, outfits, date);
  const suggestions = suggestedOutfits(outfits, date);
  const missed = missedDays(items, outfits, date, skipped);

  async function wearToday(o: Outfit) {
    const { outfit, pieces } = wearOutfit(o, outfitPieces(o, items), date);
    if (outfit) await onSaveOutfit(outfit);
    for (const p of pieces) await onSaveItem(p);
  }

  async function repeat(from: string) {
    const r = repeatDay(from, date, items, outfits);
    for (const o of r.outfits) await onSaveOutfit(o);
    for (const i of r.items) await onSaveItem(i);
  }

  function skip(day: string) {
    const next = [...skipped, day];
    setSkipped(next);
    try {
      localStorage.setItem(SKIPPED_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: the day just comes back next visit.
    }
  }

  return (
    <article className="detail">
      <h1 className="page-title">Today</h1>
      <p className="muted">{dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      {logged && (
        <section>
          <h2>Logged</h2>
          <ul className="item-grid">
            {wore.outfits.map((o) => (
              <li key={o.id} className="card item-card">
                <a href={href(`/clothes/outfits/${o.id}`)} className="item-link">
                  <OutfitCollage pieces={outfitPieces(o, items)} />
                  <div className="item-text">
                    <strong>{outfitName(o)}</strong>
                    <span className="muted small">{o.itemIds.length} pieces</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
          {wore.items.length > 0 && (
            <ul className="closet-grid day-items">
              {wore.items.map((i) => (
                <li key={i.id}>
                  <a href={href(`/clothes/${i.id}`)} className="closet-tile">
                    <ItemThumb item={i} />
                    <span className="tile-name">{i.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="small">
            <a href={href(`/clothes/calendar/${date}`)}>Edit this day</a>
          </p>
        </section>
      )}

      {!logged && previous && (
        <button className="btn btn-primary today-repeat" onClick={() => repeat(previous)}>
          Same as {dayLabel(previous, { weekday: 'long' })}
        </button>
      )}

      {suggestions.length > 0 && (
        <section>
          <h2>{logged ? 'Add another outfit' : 'Wore one of these?'}</h2>
          <ul className="item-grid">
            {suggestions.map((o) => (
              <li key={o.id}>
                <button className="card item-card picker-row" onClick={() => wearToday(o)}>
                  <OutfitCollage pieces={outfitPieces(o, items)} />
                  <span className="item-text">
                    <strong>{outfitName(o)}</strong>
                    <span className="muted small">{o.itemIds.length} pieces</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="form-actions start day-actions">
        <a className="btn" href={href(`/clothes/calendar/${date}/items`)}>
          + Log items
        </a>
        <a className="btn" href={href('/clothes/outfits/new')}>
          + New outfit
        </a>
      </div>

      {missed.length > 0 && (
        <section>
          <h2>Catch up</h2>
          <p className="muted small">Nothing logged on these days.</p>
          <ul className="item-grid">
            {missed.map((day) => (
              <li key={day} className="card item-card">
                <a href={href(`/clothes/calendar/${day}`)} className="item-link">
                  <div className="item-text">
                    <strong>{dayLabel(day, { weekday: 'long', day: 'numeric', month: 'short' })}</strong>
                    <span className="muted small">Tap to log</span>
                  </div>
                </a>
                <button className="btn btn-ghost btn-small" aria-label={`Skip ${day}`} onClick={() => skip(day)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
