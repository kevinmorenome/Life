import { useState, type ReactNode } from 'react';
import { CheckIcon, ClockIcon, EditIcon, EyeIcon, EyeOffIcon, MinusIcon, TrashIcon, UndoIcon, UsedIcon } from '../../icons';
import { money, today } from '../../lib/format';
import { IconMenu, type MenuEntry } from '../clothes/IconMenu';
import { AmountSheet, type AmountAsk } from './AmountSheet';
import { historyNotes, historyText } from './batchHistory';
import { activityOf, batchBadges, batchTitle, dueText, originalQuantity, overviewOf, pastStatus, purchaseOf, type Badge } from './batchView';
import { PictureControl } from './PictureControl';
import { unitLabel, type ProductSummary } from './products';
import { FREEZER_DAYS, THAW_DAYS, addDays, daysBetween, formatAmount, levelOptions, partLeft, type Batch, type HistoryEntry, type Stock } from './stock';
import { batchEvent, editEvent, expiryEvent, keepOutOfStats, moveEvent, stockEvent, usedEarlierEvent } from './stockActions';
import type { StockEvent } from './types';

/** What an action reports back: the new event(s), a line for the toast, and the event(s) that put things back. */
export interface StockAct {
  event: StockEvent | StockEvent[];
  text: string;
  undo?: StockEvent | StockEvent[];
  /** Nothing is left of the product. */
  done?: boolean;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** "9 Nov", with the year only when it isn't this one. */
function dayLabel(iso: string, now: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(iso.slice(0, 4) === now.slice(0, 4) ? {} : { year: 'numeric' }) });
}

export const Badges = ({ badges }: { badges: Badge[] }) =>
  badges.length === 0 ? null : (
    <span className="sbadges">
      {badges.map((b) => (
        <span key={`${b.kind}-${b.text}`} className={`sbadge tone-${b.tone}`}>
          {b.text}
        </span>
      ))}
    </span>
  );

/**
 * The shortcuts of the amount dialog. Weighed and poured goods go by parts of what there is; single things (a jar,
 * a pack) can be used by a quarter or a half, so those are offered too; items counted in cans, slices… are whole.
 */
function quickAmounts(max: number, unit: ProductSummary['unit'], packSize?: number): { label: string; value: number }[] {
  const all = { label: 'All', value: max };
  if (unit !== 'pc') return [{ label: 'Quarter', value: round3(max / 4) }, { label: 'Half', value: round3(max / 2) }, all];
  if (packSize) return max > 1 ? [{ label: '1', value: 1 }, ...(max >= 4 ? [{ label: 'Half', value: Math.floor(max / 2) }] : []), all] : [all];
  const parts = [{ label: '¼', value: 0.25 }, { label: '½', value: 0.5 }, { label: '1', value: 1 }].filter((q) => q.value < max - 1e-9);
  return [...parts, all];
}

/**
 * A product as what it really is: a set of purchases, each with its own life. On top an overview added up from the
 * batches, then every batch as its own card with its own actions, then everything that happened. Used by the stock
 * sheet and the product page, so both say the same thing. Nothing is stored here: it all comes from `stockOf()`.
 */
export function ProductStock({
  product: p,
  stock: s,
  heading = 'h1',
  activityLimit = 8,
  onAct: sendAct,
  onPhoto,
}: {
  product: ProductSummary;
  stock: Stock;
  /** Uses since it was last bought, for products that are only "have it". */
  heading?: 'h1' | 'h2';
  /** How many lines of activity show before "Show all". */
  activityLimit?: number;
  onAct(a: StockAct): void;
  onPhoto(photo: string | null): Promise<void> | void;
}) {
  const day = today();
  const [ask, setAsk] = useState<AmountAsk | null>(null);
  // While this is on, what you log still changes the stock but is kept out of the statistics.
  const [quiet, setQuiet] = useState(false);
  const [allActivity, setAllActivity] = useState(false);
  const onAct = (a: StockAct) => sendAct(quiet ? { ...a, event: keepOutOfStats(a.event), undo: keepOutOfStats(a.undo) } : a);

  const amount = (q: number) => `${formatAmount(q, p.unit)}${unitLabel(p, q)}`;
  const unit = p.unit === 'pc' ? (p.packLabel ? `${p.packLabel}s` : 'pcs') : p.unit;
  const label = (iso: string) => dayLabel(iso, day);
  const overview = overviewOf(p, s, day);
  const activity = activityOf(p, s, amount, label);
  const Name = heading;
  // A count that puts back what there was before: events are never deleted, so "undo" is a newer count.
  const restore = () => stockEvent(p.id, 'count', s.quantity, 'app');
  const restoreBatch = (b: Batch) => batchEvent(p.id, b.id!, 'count', b.quantity, 'app');
  const step = (max: number) => (p.unit !== 'pc' ? 0.05 : p.packSize ? 1 : max > 1 ? 0.5 : 0.25);

  /* ---- What you can do with one batch ---- */

  /** The same event on the day you say it happened (an event is dated the day it is logged otherwise). */
  const on = <T extends StockEvent | StockEvent[]>(e: T, date: string | undefined): T => (date ? ((Array.isArray(e) ? e.map((x) => ({ ...x, date })) : { ...e, date }) as T) : e);
  /** The earliest day something can have happened to a batch: the day it was bought. */
  const since = (b: Pick<Batch, 'id' | 'date'>) => purchaseOf(p, b)?.date ?? b.date;
  /** Asks only for the day, then does what `make` returns: finishing and throwing out. */
  function askWhen(title: string, hint: string, confirm: string, min: string, make: (date: string) => StockAct) {
    setAsk({ title, hint, amountless: true, when: { min }, step: 1, amount, unit, confirm, onConfirm: (_n, _d, when) => onAct(make(when ?? day)) });
  }

  function useSome(b: Batch) {
    setAsk({
      title: `How much ${p.name} did you use?`,
      hint: `${batchTitle(p, b)} · ${amount(b.quantity)} left`,
      max: b.quantity,
      initial: p.unit === 'pc' ? Math.min(1, b.quantity) : undefined,
      step: step(b.quantity),
      quick: quickAmounts(b.quantity, p.unit, p.packSize),
      amount,
      unit,
      confirm: 'Use',
      when: { min: since(b) },
      onConfirm: (n, _d, when) => onAct({ event: on(batchEvent(p.id, b.id!, 'use', n, 'app'), when), text: `${p.name}: used ${amount(n)} of ${batchTitle(p, b).toLowerCase()}`, undo: restoreBatch(b), done: s.quantity - n <= 1e-9 }),
    });
  }

  /** Moves some of the batch into (or out of) the freezer. Undo sets the batch back and empties the part that was moved. */
  function move(b: Batch, freezing: boolean) {
    const thawBy = addDays(day, THAW_DAYS);
    setAsk({
      title: freezing ? `Freeze how much ${p.name}?` : `Take how much ${p.name} out of the freezer?`,
      hint: freezing ? `${batchTitle(p, b)} · keeps about ${FREEZER_DAYS} days frozen` : `${batchTitle(p, b)} · thawed food isn’t frozen again`,
      max: b.quantity,
      initial: b.quantity,
      step: step(b.quantity),
      quick: quickAmounts(b.quantity, p.unit, p.packSize),
      amount,
      unit,
      confirm: freezing ? 'Freeze' : 'Thaw',
      // A frozen batch can only be taken out after it went in.
      when: { min: (!freezing && b.frozen) || since(b), label: freezing ? 'Frozen on' : 'Taken out on' },
      ...(freezing ? {} : { date: { label: 'Use by', value: thawBy, min: since(b), days: THAW_DAYS } }),
      onConfirm: (n, useBy, when) => {
        const event = on(moveEvent(p.id, b.id!, freezing ? 'freeze' : 'thaw', n, 'app'), when);
        const thawBy = addDays(when ?? day, THAW_DAYS);
        const made = `${event.type}-${event.id}:${b.id}`;
        // A use-by other than the usual two days is its own event on the thawed batch, recorded just after the thaw.
        const later = new Date(Date.parse(event.createdAt) + 1).toISOString();
        const dated = useBy && useBy !== thawBy ? [{ ...expiryEvent(p.id, made, useBy, 'app'), createdAt: later, updatedAt: later }] : [];
        onAct({
          event: [event, ...dated],
          text: freezing ? `${p.name}: ${amount(n)} in the freezer` : `${p.name}: ${amount(n)} thawed, use by ${label(useBy ?? thawBy)}`,
          undo: [restoreBatch(b), batchEvent(p.id, made, 'count', 0, 'app')],
        });
      },
    });
  }

  const batchMenu = (b: Batch): MenuEntry[] => [
    // Food that was thawed is not frozen again: it is there to be used.
    ...(b.frozen ? [{ label: 'Thaw…', icon: <UndoIcon />, onSelect: () => move(b, false) }] : b.thawed ? [] : [{ label: 'Freeze…', icon: <ClockIcon />, onSelect: () => move(b, true) }]),
    { label: 'Finished…', icon: <CheckIcon />, onSelect: () => askWhen('When did you finish it?', `${batchTitle(p, b)} · ${amount(b.quantity)} left`, 'Finished', since(b), (when) => ({ event: on(batchEvent(p.id, b.id!, 'count', 0, 'app'), when), text: `${p.name}: ${batchTitle(p, b).toLowerCase()} finished`, undo: restoreBatch(b), done: s.batches.length === 1 })) },
    { label: 'Used earlier, date unknown', icon: <UsedIcon />, onSelect: () => onAct({ event: usedEarlierEvent(p.id, b.id!, 'app'), text: `${p.name}: ${batchTitle(p, b).toLowerCase()} used earlier`, undo: restoreBatch(b), done: s.batches.length === 1 }) },
    { label: 'Discard…', icon: <TrashIcon />, danger: true, onSelect: () => askWhen('When did you throw it out?', `${batchTitle(p, b)} · ${amount(b.quantity)}`, 'Discard', since(b), (when) => ({ event: on(batchEvent(p.id, b.id!, 'toss', b.quantity, 'app'), when), text: `${p.name}: ${batchTitle(p, b).toLowerCase()} discarded`, undo: restoreBatch(b), done: s.batches.length === 1 })) },
  ];

  /* ---- What you can do with the product as a whole ---- */

  function useAny() {
    const levels = levelOptions(s.quantity, p.unit, p.packSize).map((l) => ({ label: l.label, value: round3(s.quantity - partLeft(s.quantity, p.unit, l.fraction)) }));
    setAsk({
      title: `How much ${p.name} did you use?`,
      hint: s.batches.length > 1 ? 'Comes off the batch that expires first.' : `${amount(s.quantity)} left`,
      max: s.quantity,
      initial: p.unit === 'pc' ? Math.min(1, s.quantity) : undefined,
      step: step(s.quantity),
      quick: levels.length > 0 ? levels.filter((l) => l.value > 0) : quickAmounts(s.quantity, p.unit, p.packSize),
      amount,
      unit,
      confirm: 'Use',
      when: { min: oldest },
      onConfirm: (n, _d, when) => onAct({ event: on(stockEvent(p.id, 'use', n, 'app'), when), text: `${p.name}: used ${amount(n)}`, undo: restore(), done: s.quantity - n <= 1e-9 }),
    });
  }

  function countAll() {
    setAsk({
      title: `How much ${p.name} do you have now?`,
      hint: 'A count sets the total: less comes off the oldest batch, more is a new batch.',
      initial: s.quantity,
      step: p.unit === 'pc' ? 1 : 0.05,
      amount,
      unit,
      confirm: 'Save',
      onConfirm: (n) => onAct({ event: stockEvent(p.id, 'count', n, 'app'), text: `${p.name}: counted ${amount(n)}`, undo: restore(), done: n <= 0 }),
    });
  }

  const several = s.batches.length > 1;
  // Nothing can have happened before the first purchase.
  const oldest = p.purchases.reduce((m, x) => (x.date < m ? x.date : m), day);
  const have = s.quantity > 0;
  const productMenu: MenuEntry[] = [
    ...(have ? [{ label: 'Use some…', icon: <MinusIcon />, onSelect: useAny }] : []),
    { label: 'I have…', icon: <EditIcon />, onSelect: countAll },
    ...(have
      ? [
          { label: several ? 'Finished all…' : 'Finished…', icon: <CheckIcon />, onSelect: () => askWhen('When did you finish it?', `${amount(s.quantity)} left`, 'Finished', oldest, (when) => ({ event: on(stockEvent(p.id, 'count', 0, 'app'), when), text: `${p.name} finished`, undo: restore(), done: true })) },
          { label: 'Used earlier, date unknown', icon: <UsedIcon />, onSelect: () => onAct({ event: usedEarlierEvent(p.id, undefined, 'app'), text: `${p.name}: used earlier, no date`, undo: restore(), done: true }) },
          { label: several ? 'Discard all…' : 'Discard…', icon: <TrashIcon />, danger: true, onSelect: () => askWhen('When did you throw it out?', amount(s.quantity), 'Discard', oldest, (when) => ({ event: on(stockEvent(p.id, 'toss', s.quantity, 'app'), when), text: `${p.name} discarded`, undo: restore(), done: true })) },
        ]
      : []),
    { label: quiet ? 'Count in statistics again' : 'Keep out of statistics', icon: quiet ? <EyeIcon /> : <EyeOffIcon />, onSelect: () => setQuiet(!quiet) },
  ];

  /* ---- Pieces ---- */

  /**
   * What happened to a batch, oldest first. A line that comes from an event of yours can be corrected: its date is a
   * value you tap (the browser's calendar lies over it), and the bin takes the line away. Neither changes the event:
   * each writes a correction (`editEvent`), and Undo writes one that puts the line back as it was.
   */
  const history = (entries: HistoryEntry[] | undefined, b: Pick<Batch, 'id' | 'date'>) => {
    // An event can't happen before its batch was bought, or after today.
    const earliest = purchaseOf(p, b)?.date ?? b.date;
    return (
      <ul className="batch-history">
        {(entries ?? []).map((h, i) => {
          const what = h.kind === 'finished' && h.undated ? 'Used earlier' : historyText(h, amount);
          const when = h.undated ? 'Date unknown' : label(h.date);
          const id = h.eventId;
          // As the line is now, so a correction can be taken back.
          const asNow = () => editEvent(p.id, id!, h.undated ? { undated: true } : { date: h.date }, 'app');
          // Only something used or finished can have happened "at some point": the calendar's Reset means that.
          const canBeUndated = h.kind === 'used' || h.kind === 'finished';
          return (
            <li key={`${id ?? 'x'}-${i}`}>
              {id ? (
                <label className="muted small batch-history-date hist-date">
                  <span>{when}</span>
                  <input
                    type="date"
                    value={h.undated ? '' : h.date}
                    min={earliest}
                    max={day}
                    aria-label={`Date of “${what}” on ${batchTitle(p, b)}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      // The calendar's own Reset button empties the field: that is "no date", like Used earlier.
                      if (v === '') {
                        if (canBeUndated && !h.undated) onAct({ event: editEvent(p.id, id, { undated: true }, 'app'), text: `${p.name}: “${what}” has no date now`, undo: asNow() });
                        return;
                      }
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < earliest || v > day || (v === h.date && !h.undated)) return;
                      onAct({ event: editEvent(p.id, id, { date: v }, 'app'), text: `${p.name}: “${what}” moved to ${label(v)}`, undo: asNow() });
                    }}
                  />
                </label>
              ) : (
                <span className="muted small batch-history-date">{when}</span>
              )}
              <span className="small">
                {what}
                {h.kind === 'expiry' && h.useBy ? `: ${label(h.useBy)}` : ''}
                {historyNotes(h).length > 0 && <span className="muted"> · {historyNotes(h).join(' · ')}</span>}
              </span>
              {id && (
                <button type="button" className="hist-remove" aria-label={`Remove “${what}” from ${batchTitle(p, b)}`} onClick={() => onAct({ event: editEvent(p.id, id, { removed: true }, 'app'), text: `${p.name}: “${what}” removed`, undo: asNow() })}>
                  <TrashIcon />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  /** Where a batch came from: "Bought 31 Oct · Konzum · €1.89 / kg". */
  const origin = (b: Batch): string => {
    const purchase = purchaseOf(p, b);
    if (!purchase) return `Counted ${label(b.date)}`;
    return [`Bought ${label(purchase.date)}`, purchase.store, `${money(purchase.unitPrice)}${purchase.unit === 'pc' ? (p.packSize ? ' a pack' : '') : ` / ${purchase.unit}`}`].join(' · ');
  };

  const card = (b: Batch): ReactNode => {
    const entries = b.id ? s.history[b.id] : undefined;
    const original = originalQuantity(entries);
    const left = b.useBy ? daysBetween(day, b.useBy) : undefined;
    const title = batchTitle(p, b);
    const part = original && original > b.quantity + 1e-9 ? Math.max(4, Math.round((b.quantity / original) * 100)) : undefined;
    return (
      <li key={b.id ?? `${b.date}-${b.quantity}`} className={`bcard${b.frozen ? ' bcard-frozen' : ''}${left !== undefined && left < 0 ? ' bcard-past' : ''}`}>
        <div className="bcard-top">
          <span className="bcard-id">{title}</span>
          {b.id && (
            <div className="bcard-actions">
              <button type="button" className="bcard-use" onClick={() => useSome(b)} aria-label={`Use some of ${title}`}>
                <MinusIcon />
                Use
              </button>
              <IconMenu entries={batchMenu(b)} label={`More actions for ${title}`} />
            </div>
          )}
        </div>
        <p className="bcard-qty">
          {amount(b.quantity)}
          {part !== undefined && <span className="bcard-of"> of {amount(original!)}</span>}
        </p>
        {part !== undefined && (
          <span className="bcard-bar" aria-hidden>
            <span style={{ width: `${part}%` }} />
          </span>
        )}
        <Badges badges={batchBadges(p, b, entries, day)} />
        <p className="muted small bcard-meta">{origin(b)}</p>
        {b.frozen && <p className="muted small bcard-meta">Frozen {label(b.frozen)}</p>}
        {b.thawed && <p className="small bcard-meta bcard-warn">Thawed {label(b.thawed)} · use this first</p>}
        <div className="bcard-foot">
          {b.id ? (
            <label className="bcard-date">
              <span>
                {b.useBy ? `${b.frozen ? 'Keeps until' : 'Use by'} ${label(b.useBy)}` : 'Set a use-by date'}
                {left !== undefined && <span className="bcard-due"> · {dueText(left)}</span>}
              </span>
              <input
                type="date"
                value={b.useBy ?? ''}
                aria-label={`Use-by date of ${title}`}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v === b.useBy) return;
                  onAct({ event: expiryEvent(p.id, b.id!, v, 'app'), text: `${p.name}: ${title.toLowerCase()} use by ${label(v)}`, undo: b.useBy ? expiryEvent(p.id, b.id!, b.useBy, 'app') : undefined });
                }}
              />
            </label>
          ) : (
            b.useBy && <span className="small muted">Use by {label(b.useBy)}</span>
          )}
          {entries && entries.length > 1 && (
            <details className="bcard-history">
              <summary>History ({entries.length})</summary>
              {history(entries, b)}
            </details>
          )}
        </div>
      </li>
    );
  };

  const purchaseDay = (b: Batch) => purchaseOf(p, b)?.date ?? b.date;
  const newestFirst = (a: Batch, b: Batch) => purchaseDay(b).localeCompare(purchaseDay(a)) || (b.id ?? '').localeCompare(a.id ?? '');
  const attention = overview.soon + overview.past;
  const shown = allActivity ? activity : activity.slice(0, activityLimit);

  return (
    <div className="pstock">
      {/* A. Overview: added up from the batches */}
      <header className="pstock-head">
        <PictureControl product={p} className="food-art-big" onPhoto={onPhoto} />
        <div className="pstock-text">
          <Name className="pstock-name">{p.name}</Name>
          <p className="muted small pstock-where">
            {overview.places.join(' · ')}
          </p>
          <Badges badges={overview.badges} />
        </div>
        {productMenu.length > 0 && <IconMenu entries={productMenu} label={`Actions for all of ${p.name}`} triggerClassName="icon-action pstock-more" />}
      </header>

      <dl className="pstock-stats">
        <div>
          <dd>{have ? amount(s.quantity) : 'None'}</dd>
          <dt>Remaining</dt>
        </div>
        <div>
          <dd>{overview.active}</dd>
          <dt>Active {overview.active === 1 ? 'batch' : 'batches'}</dt>
        </div>
        <div className={overview.past ? 'tone-red' : overview.soon ? 'tone-orange' : ''}>
          <dd>{attention}</dd>
          <dt>{overview.past && !overview.soon ? 'Past date' : overview.soon && !overview.past ? 'Expiring soon' : 'To use up'}</dt>
        </div>
      </dl>
      {quiet && (
        <p className="small pstock-quiet" role="status">
          What you log now changes the stock but isn’t counted in statistics.
          <button type="button" onClick={() => setQuiet(false)}>
            Turn off
          </button>
        </p>
      )}

      {/* B. Purchase batches: each one on its own */}
      {(
        <section className="pstock-section" aria-label="Purchase batches">
          <div className="pstock-section-head">
            <h2>Purchase batches</h2>
            {s.batches.length > 0 && <span className="muted small">newest first</span>}
          </div>
          {s.batches.length === 0 ? (
            <p className="muted small pstock-empty">Nothing in stock. Buy it again and the purchase shows up here as a new batch; if you still have some, use I have… in the menu above.</p>
          ) : (
            <ul className="bcard-list">{[...s.batches].sort(newestFirst).map(card)}</ul>
          )}
          {s.pastBatches.length > 0 && (
            <details className="bcard-past">
              <summary>Past batches ({s.pastBatches.length})</summary>
              <ul className="bcard-list">
                {[...s.pastBatches].sort(newestFirst).map((b) => {
                  const entries = s.history[b.id!];
                  const end = pastStatus(entries);
                  return (
                    <li key={b.id} className="bcard bcard-gone">
                      <div className="bcard-top">
                        <span className="bcard-id">{batchTitle(p, b)}</span>
                        <Badges badges={[end]} />
                      </div>
                      <p className="muted small bcard-meta">
                        {origin(b)}
                        {end.date ? ` · ${end.undated ? 'date unknown' : label(end.date)}` : ''}
                      </p>
                      <details className="bcard-history">
                        <summary>History ({entries?.length ?? 0})</summary>
                        {history(entries, b)}
                      </details>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* C. Activity: everything that happened, to any batch */}
      <section className="pstock-section" aria-label="Activity">
        <div className="pstock-section-head">
          <h2>Activity</h2>
        </div>
        {activity.length === 0 ? (
          <p className="muted small pstock-empty">Nothing has happened yet.</p>
        ) : (
          <ul className="activity">
            {shown.map((a) => (
              <li key={a.key}>
                <span className={`activity-dot tone-${a.tone}`} aria-hidden />
                <span className="activity-main">
                  <span>{a.text}</span>
                  {(a.batch || a.notes.length > 0) && <span className="muted small">{[a.batch, ...a.notes].filter(Boolean).join(' · ')}</span>}
                </span>
                <span className="muted small activity-date">{a.undated ? 'Date unknown' : label(a.date)}</span>
              </li>
            ))}
          </ul>
        )}
        {activity.length > activityLimit && (
          <button type="button" className="pstock-all" onClick={() => setAllActivity(!allActivity)}>
            {allActivity ? 'Show less' : `Show all (${activity.length})`}
          </button>
        )}
      </section>

      {ask && <AmountSheet key={ask.title + (ask.hint ?? '')} ask={ask} onClose={() => setAsk(null)} />}
    </div>
  );
}
