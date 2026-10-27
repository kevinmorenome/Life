import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../lib/router';
import { ItemDetail } from './ItemDetail';
import { markReviewed, reviewQueue } from './review';
import type { ClothingItem, Outfit } from './types';

const SLIDE_MS = 220;

/**
 * Drawer over the closet that steps through the items needing review, each
 * shown as the normal item page (every field editable in place). Save marks
 * the item reviewed; "Check later" leaves it flagged (it comes back next
 * visit). Either way the page slides left to the next item.
 */
export function ReviewFlow({
  items,
  outfits,
  onSave,
  onDelete,
}: {
  items: ClothingItem[];
  outfits: Outfit[];
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
  const close = () => navigate('/clothes');

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

  return (
    <div className="review-backdrop" onClick={close}>
      <div className="review-sheet" role="dialog" aria-modal="true" aria-label="Items to review" onClick={(e) => e.stopPropagation()}>
        <div className="review-sheet-head">
          <span className="review-handle" aria-hidden />
          <p className="review-count">
            {flagged ? `${flagged} to review` : 'Nothing to review'}
            {later.size > 0 && <span className="muted"> · {later.size} for later</span>}
          </p>
        </div>

        {current ? (
          <div key={current.id} className={leaving ? 'review-page review-out' : 'review-page review-in'}>
            <ItemDetail
              item={current}
              items={items}
              outfits={outfits}
              onSave={onSave}
              onDelete={onDelete}
              review={{
                onSave: async () => {
                  await onSave(markReviewed(current, new Date()));
                  advance(current, later);
                },
                onLater: () => advance(current, new Set(later).add(current.id)),
                onClose: close,
                onRemoved: () => advance(current, later),
              }}
            />
          </div>
        ) : (
          <div className="review-end">
            <p className="review-done">{flagged ? 'All caught up for now.' : 'Nothing to review.'}</p>
            <p className="muted small">
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
              <button type="button" className="btn" onClick={close}>
                Back to closet
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
