import { useState } from 'react';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { CheckIcon, PlusIcon, ShirtIcon } from '../../icons';
import { wearsByDay } from './calendar';
import { IconMenu } from './IconMenu';
import { PencilIcon, RepeatIcon } from './icons';
import { OutfitBoard } from './OutfitBoard';
import { outfitName, outfitPieces, wearOutfit } from './outfits';
import { dayPieces, missedDays, previousLoggedDay, repeatDay, suggestedOutfits } from './today';
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
    <article className="today">
      <header className="today-head">
        <div>
          <h1 className="page-title">Today</h1>
          <p className="muted">{dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <IconMenu
          entries={[
            { label: 'Log items', icon: <PlusIcon />, path: `/clothes/calendar/${date}/items` },
            { label: 'New outfit', icon: <ShirtIcon />, path: '/clothes/outfits/new' },
            { label: 'Edit this day', icon: <PencilIcon />, path: `/calendar/${date}` },
          ]}
        />
      </header>

      {logged && (
        <ul className="outfit-cards">
          {wore.outfits.map((o) => (
            <li key={o.id}>
              <a href={href(`/clothes/outfits/${o.id}`)} className="outfit-card" aria-label={`${outfitName(o)}, logged today`}>
                <OutfitBoard pieces={outfitPieces(o, items)} />
                <span className="card-fab card-fab-done" aria-hidden>
                  <CheckIcon />
                </span>
                {o.name && <span className="outfit-card-name">{o.name}</span>}
              </a>
            </li>
          ))}
          {wore.items.map((i) => (
            <li key={i.id}>
              <a href={href(`/clothes/${i.id}`)} className="outfit-card" aria-label={`${i.name}, logged today`}>
                <OutfitBoard pieces={[i]} />
                <span className="card-fab card-fab-done" aria-hidden>
                  <CheckIcon />
                </span>
                <span className="outfit-card-name">{i.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {(previous || suggestions.length > 0) && (
        <>
          <h2 className="today-title">{logged ? 'Add another look' : 'Wore one of these?'}</h2>
          <ul className="outfit-cards">
            {previous && (
              <li>
                <div className="outfit-card">
                  <OutfitBoard pieces={dayPieces(previous, items, outfits)} />
                  <button
                    className="card-fab"
                    aria-label={`Wear ${dayLabel(previous, { weekday: 'long' })}’s look again`}
                    onClick={() => repeat(previous)}
                  >
                    <RepeatIcon />
                  </button>
                  <span className="outfit-card-name">{dayLabel(previous, { weekday: 'long' })}</span>
                </div>
              </li>
            )}
            {suggestions.map((o) => (
              <li key={o.id}>
                <div className="outfit-card">
                  <a href={href(`/clothes/outfits/${o.id}`)} className="card-cover" aria-label={outfitName(o)}>
                    <OutfitBoard pieces={outfitPieces(o, items)} />
                  </a>
                  <button className="card-fab" aria-label={`Log ${outfitName(o)} today`} onClick={() => wearToday(o)}>
                    <CheckIcon />
                  </button>
                  {o.name && <span className="outfit-card-name">{o.name}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {missed.length > 0 && (
        <>
          <h2 className="today-title">Catch up</h2>
          <ul className="flat-list">
            {missed.map((day) => (
              <li key={day}>
                <span>{dayLabel(day, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                <a className="icon-action" href={href(`/calendar/${day}`)} aria-label={`Log ${day}`}>
                  <PencilIcon />
                </a>
                <button className="icon-action" aria-label={`Skip ${day}`} onClick={() => skip(day)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
