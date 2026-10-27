import { useEffect, useRef, useState } from 'react';
import { href } from '../../lib/router';
import { TrashIcon } from './icons';
import { ItemForm } from './ItemForm';
import { reviewQueue } from './review';
import type { ClothingItem } from './types';

const SLIDE_MS = 220;

/**
 * Steps through the items that need review, one editable page at a time. Save
 * marks the item reviewed; "Check later" leaves it flagged (it shows up again
 * next time). Either way the page slides left to the next item.
 */
export function ReviewFlow({
  items,
  onSave,
  onDelete,
}: {
  items: ClothingItem[];
  onSave: (item: ClothingItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  // Put off in this visit only; they stay flagged and come back next time.
  const [later, setLater] = useState<ReadonlySet<string>>(new Set());
  const [currentId, setCurrentId] = useState<string>();
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const queue = reviewQueue(items, later);
  const flagged = items.filter((i) => i.needsReview).length;
  // Keep showing the item being handled while it slides out, even though it already left the queue.
  const current = items.find((i) => i.id === currentId && (i.needsReview || leaving)) ?? queue[0];

  /** Slides the current page out, then shows the next item (not counting `handled` or anything put off). */
  function advance(handled: ClothingItem, nowLater: ReadonlySet<string>) {
    setLeaving(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLater(nowLater);
      setCurrentId(reviewQueue(items, nowLater).find((i) => i.id !== handled.id)?.id ?? '');
      setLeaving(false);
    }, SLIDE_MS);
  }

  async function remove(item: ClothingItem) {
    if (!confirm(`Remove “${item.name}”? This can’t be undone.`)) return;
    await onDelete(item.id);
    advance(item, later);
  }

  if (!current) {
    return (
      <div className="review-flow">
        <p className="review-done">{flagged ? 'All caught up for now.' : 'Nothing to review.'}</p>
        <p className="muted small center">
          {flagged
            ? `${flagged} ${flagged === 1 ? 'item is' : 'items are'} saved for later.`
            : 'New items from receipts show up here.'}
        </p>
        <div className="form-actions center">
          {flagged > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => (setLater(new Set()), setCurrentId(undefined))}>
              Review them now
            </button>
          )}
          <a className="btn" href={href('/clothes')}>
            Back to closet
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="review-flow">
      <div className="review-head">
        <a className="back" href={href('/clothes')} aria-label="Back to closet">
          ←
        </a>
        <h1>
          {flagged} to review
          {later.size > 0 && <span className="muted small"> · {later.size} for later</span>}
        </h1>
        <button type="button" className="filter-btn" aria-label={`Remove ${current.name}`} onClick={() => remove(current)}>
          <TrashIcon />
        </button>
      </div>
      <div key={current.id} className={leaving ? 'review-page review-out' : 'review-page review-in'}>
        <ItemForm
          existing={current}
          onSave={onSave}
          review={{
            onSaved: () => advance(current, later),
            onLater: () => advance(current, new Set(later).add(current.id)),
          }}
        />
      </div>
    </div>
  );
}
