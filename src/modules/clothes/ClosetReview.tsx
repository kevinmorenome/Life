import { useEffect, useMemo, useState } from 'react';
import { today, shortDate } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { swatchCss } from './colors';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { ItemThumb } from './ItemThumb';
import {
  isReviewed,
  markReviewed,
  reviewable,
  stepInfo,
  stepItems,
  stepProgress,
  stepValues,
  STEPS,
  subcategoryOptions,
  toggleAllSeasons,
  toggleStepValue,
  toggleSubcategory,
  type ReviewStep,
} from './review';
import { CATEGORIES, label, type Category, type ClothingItem } from './types';

interface Props {
  step?: string;
  items: ClothingItem[];
  onSave: (item: ClothingItem) => Promise<void>;
}

export function ClosetReview({ step, items, onSave }: Props) {
  const info = step ? stepInfo(step) : undefined;
  if (step && !info) return <p className="muted">That review step doesn’t exist.</p>;
  return info ? <ReviewStepView step={info.id} items={items} onSave={onSave} /> : <ReviewHub items={items} />;
}

function ReviewHub({ items }: { items: ClothingItem[] }) {
  return (
    <>
      <a className="back" href={href('/clothes')} aria-label="Back to closet">
        <ChevronLeftIcon />
      </a>
      <h2 className="review-title">Closet review</h2>
      <p className="review-intro muted">Quickly review and edit your clothing details. Accurate details make for better filters and outfit ideas.</p>
      <ul className="review-list">
        {STEPS.map((s) => {
          const p = stepProgress(items, s.id);
          const done = p.total > 0 && p.pending === 0;
          return (
            <li key={s.id}>
              <a href={href(`/clothes/review/${s.id}`)} className="review-row">
                <span className="review-row-main">
                  <span className="review-row-title">
                    <strong>{s.title}</strong>
                    <span className="review-time">{s.minutes}</span>
                  </span>
                  <span className={p.lastReviewed ? 'review-status' : 'review-status muted'}>
                    {p.lastReviewed ? (
                      <>
                        <span className={done ? 'review-tick' : 'review-tick review-tick-part'} aria-hidden />
                        {shortDate(p.lastReviewed)}
                        {p.pending > 0 && ` · ${p.pending} new`}
                      </>
                    ) : (
                      'Not yet'
                    )}
                  </span>
                </span>
                <ChevronRightIcon />
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ReviewStepView({ step, items, onSave }: { step: ReviewStep; items: ClothingItem[]; onSave: (item: ClothingItem) => Promise<void> }) {
  const info = stepInfo(step)!;
  const [onlyNew, setOnlyNew] = useState(false);
  const [category, setCategory] = useState<Category | 'all'>('all');
  // Items shown when the page opened, so rows don't vanish while you edit them under "Only new items".
  const [shownIds, setShownIds] = useState<string[]>();

  const available = useMemo(() => stepItems(items, step, category, onlyNew), [items, step, category, onlyNew]);
  useEffect(() => setShownIds(undefined), [step, category, onlyNew]);
  const ids = shownIds ?? available.map((i) => i.id);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const shown = ids.map((id) => byId.get(id)).filter((i): i is ClothingItem => Boolean(i));

  const counts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const i of reviewable(items)) if (!onlyNew || !isReviewed(i, step)) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return m;
  }, [items, step, onlyNew]);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  const edit = (next: ClothingItem) => {
    if (!shownIds) setShownIds(available.map((i) => i.id));
    return onSave(next);
  };

  async function done() {
    const date = today();
    for (const i of shown) await onSave(markReviewed(byId.get(i.id) ?? i, step, date));
    navigate('/clothes/review');
  }

  return (
    <div className="review-step">
      <header className="review-head">
        <a className="back" href={href('/clothes/review')} aria-label="Back to closet review">
          <ChevronLeftIcon />
        </a>
        <h2>{info.title}</h2>
      </header>
      <h3 className="review-prompt">Select appropriate options</h3>

      <label className="review-toggle">
        <span>Only new items</span>
        <input type="checkbox" role="switch" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
      </label>

      <nav className="category-tabs" aria-label="Categories">
        <button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
          All
        </button>
        {CATEGORIES.filter((c) => counts.get(c) || c === category).map((c) => (
          <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>
            {label(c)}
          </button>
        ))}
      </nav>

      <p className="review-count muted">
        {shown.length} {shown.length === 1 ? 'item' : 'items'}
        {category === 'all' && onlyNew && total === 0 ? ' · all reviewed' : ''}
      </p>

      <ul className="review-items">
        {shown.map((item) => {
          const current = stepValues(item, step);
          const subs = step === 'category' ? subcategoryOptions(item) : [];
          return (
            <li key={item.id} className="review-item">
              <ItemThumb item={item} />
              <div className="review-chips">
                <div className="review-name-row">
                  <p className="review-name">
                    <strong>{item.name}</strong>
                    {item.brand && <span className="muted">{item.brand}</span>}
                  </p>
                  {step === 'season' && (
                    <button
                      type="button"
                      className="chip chip-review"
                      aria-pressed={current.length === info.options.length}
                      onClick={() => edit(toggleAllSeasons(item))}
                    >
                      All
                    </button>
                  )}
                </div>
                <div className="chips">
                  {info.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className="chip chip-review"
                      aria-pressed={current.some((v) => v.toLowerCase() === o.toLowerCase())}
                      onClick={() => edit(toggleStepValue(item, step, o))}
                    >
                      {step === 'color' && <span className="dot" style={swatchCss(o) ? { background: swatchCss(o)! } : undefined} aria-hidden />}
                      {o}
                    </button>
                  ))}
                  {step === 'color' &&
                    current
                      .filter((c) => !info.options.some((o) => o.toLowerCase() === c.toLowerCase()))
                      .map((c) => (
                        <button key={c} type="button" className="chip chip-review" aria-pressed onClick={() => edit(toggleStepValue(item, step, c))}>
                          {c}
                        </button>
                      ))}
                </div>
                {subs.length > 0 && (
                  <div className="chips review-subs" aria-label="Sub-category">
                    {subs.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="chip chip-review"
                        aria-pressed={item.subcategory?.toLowerCase() === s.toLowerCase()}
                        onClick={() => edit(toggleSubcategory(item, s))}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="muted empty">{onlyNew ? 'Everything here is already reviewed.' : 'No items here.'}</p>}

      <div className="sticky-actions review-done">
        <button type="button" className="btn btn-primary btn-block" onClick={done}>
          Done
        </button>
      </div>
    </div>
  );
}
