import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { newId } from '../../lib/db';
import { navigate } from '../../lib/router';
import { ItemDetail } from './ItemDetail';
import type { ClothingItem, Outfit } from './types';

const CLOSE_DISTANCE = 90;

/**
 * Add item: a bottom drawer over the closet showing the normal item page on a blank in-memory draft.
 * Drag the line at the top down to close; Save at the bottom is the only button. Nothing is stored until Save.
 */
export function NewItem({ items, outfits, onSave }: { items: ClothingItem[]; outfits: Outfit[]; onSave: (item: ClothingItem) => Promise<void> }) {
  const [draft, setDraft] = useState<ClothingItem>(() => {
    const now = new Date().toISOString();
    return { id: newId(), name: '', category: 'tops', seasons: [], status: 'active', wears: [], createdAt: now, updatedAt: now };
  });
  // While the line is dragged the drawer follows the finger; it only carries a transform during the drag,
  // because a transform would trap the fixed field sheets inside it.
  const [dragY, setDragY] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);
  const start = useRef<{ y: number; id: number } | null>(null);
  const close = () => navigate('/clothes');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.field-sheet') && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDown = (e: PointerEvent) => {
    start.current = { y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setSettling(false);
  };
  const onMove = (e: PointerEvent) => {
    if (start.current && e.pointerId === start.current.id) setDragY(Math.max(0, e.clientY - start.current.y));
  };
  const onEnd = (e: PointerEvent, cancelled = false) => {
    const s = start.current;
    start.current = null;
    if (!s || e.pointerId !== s.id) return;
    if (!cancelled && e.clientY - s.y >= CLOSE_DISTANCE) return close();
    setSettling(true);
    setDragY(0);
    setTimeout(() => (setDragY(null), setSettling(false)), 220);
  };

  return (
    <div className="review-backdrop" onClick={close}>
      <div
        className="review-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Add item"
        onClick={(e) => e.stopPropagation()}
        style={dragY !== null ? { transform: `translateY(${dragY}px)`, transition: settling ? 'transform 220ms ease-out' : 'none', animation: 'none' } : undefined}
      >
        <div
          className="review-sheet-head drawer-grab"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onEnd}
          onPointerCancel={(e) => onEnd(e, true)}
        >
          <span className="review-handle" aria-hidden />
        </div>
        <ItemDetail
          item={draft}
          items={items}
          outfits={outfits}
          onSave={async (next) => setDraft(next)}
          onDelete={async () => {}}
          draft={{
            canSave: draft.name.trim() !== '',
            onSave: async () => {
              const now = new Date().toISOString();
              await onSave({ ...draft, name: draft.name.trim(), updatedAt: now });
              navigate(`/clothes/${draft.id}`);
            },
          }}
        />
      </div>
    </div>
  );
}
