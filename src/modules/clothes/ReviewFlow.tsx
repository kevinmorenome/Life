import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { navigate } from '../../lib/router';
import { CheckIcon } from './icons';
import { ItemDetail } from './ItemDetail';
import { markReviewed, reviewQueue } from './review';
import { useCutOutOnOpen } from './useCutOut';
import type { ClothingItem, Outfit } from './types';

const SLIDE_MS = 220;
/** How far left (px) a swipe must go to count as "check later". */
const SWIPE_DISTANCE = 90;

/**
 * Drawer over the closet that steps through the items needing review, each
 * shown as the normal item page (every field editable in place). Save marks
 * the item reviewed; "Check later" leaves it flagged (it comes back next
 * visit). Swiping the page left does the same as "Check later". Either way
 * the page slides left to the next item.
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

  // Swipe: the page follows the finger (`dragX`, only while dragging or settling; a lingering transform would trap the fixed field sheets).
  const [dragX, setDragX] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);
  const drag = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const queue = reviewQueue(items, later);
  const flagged = items.filter((i) => i.needsReview).length;
  // Keep showing the item being handled while it slides out, even though it already left the queue.
  const current = items.find((i) => i.id === currentId && (i.needsReview || leaving)) ?? queue[0];
  const close = () => navigate('/clothes');

  // Each item's photo gets its background removed when it comes up.
  const cutting = useCutOutOnOpen(current, !!current, (id) => itemsRef.current.find((i) => i.id === id), onSave);

  /** Slides the current page out, then shows the next item (not counting `handled` or anything put off). */
  function advance(handled: ClothingItem, nowLater: ReadonlySet<string>) {
    setLeaving(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLater(nowLater);
      setCurrentId(reviewQueue(items, nowLater).find((i) => i.id !== handled.id)?.id ?? '');
      setLeaving(false);
      setDragX(null);
      setSettling(false);
    }, SLIDE_MS);
  }

  function onPointerDown(e: PointerEvent) {
    // Leave text fields alone so selecting and moving the caret keep working.
    if (leaving || settling || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.horizontal === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      d.horizontal = Math.abs(dx) > Math.abs(dy);
      if (d.horizontal) e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.horizontal) setDragX(Math.min(0, dx));
  }

  function onPointerEnd(e: PointerEvent, cancelled = false) {
    const d = drag.current;
    drag.current = null;
    if (!d || e.pointerId !== d.id || !d.horizontal || !current) return;
    const dx = e.clientX - d.x;
    setSettling(true);
    if (!cancelled && dx <= -SWIPE_DISTANCE) {
      setDragX(-(pageRef.current?.offsetWidth ?? 400));
      advance(current, new Set(later).add(current.id));
    } else {
      // Not far enough: spring back, then drop the transform.
      setDragX(0);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => (setDragX(null), setSettling(false)), SLIDE_MS);
    }
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

        {dragX !== null && dragX < -20 && (
          <p className="review-swipe-hint" style={{ opacity: Math.min(1, Math.abs(dragX) / SWIPE_DISTANCE) }} aria-hidden>
            Check later
          </p>
        )}

        {current ? (
          <div
            key={current.id}
            ref={pageRef}
            className={dragX !== null ? 'review-page' : leaving ? 'review-page review-out' : 'review-page review-in'}
            style={
              dragX !== null
                ? {
                    transform: `translateX(${dragX}px)`,
                    opacity: 1 - Math.min(0.5, Math.abs(dragX) / 500),
                    transition: settling ? `transform ${SLIDE_MS}ms ease-out, opacity ${SLIDE_MS}ms ease-out` : 'none',
                  }
                : undefined
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={(e) => onPointerEnd(e, true)}
          >
            <ItemDetail
              item={current}
              items={items}
              outfits={outfits}
              onSave={onSave}
              onDelete={onDelete}
              photoBusy={cutting}
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
            <span className="review-end-icon" aria-hidden>
              <CheckIcon />
            </span>
            <p className="review-done">{flagged ? 'All caught up for now' : 'Nothing to review'}</p>
            <p className="muted review-end-note">
              {flagged
                ? `${flagged} ${flagged === 1 ? 'item is' : 'items are'} saved for later. ${flagged === 1 ? 'It' : 'They'} will be here next time you open To review.`
                : 'New items from receipts show up here.'}
            </p>
            <button type="button" className="btn btn-primary review-end-btn" onClick={close}>
              Back to closet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
