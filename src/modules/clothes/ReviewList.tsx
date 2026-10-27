import { href } from '../../lib/router';
import { CheckIcon, PencilIcon, TrashIcon } from './icons';
import { ItemThumb } from './ItemThumb';
import { itemsToReview, markReviewed, reviewSummary } from './review';
import type { ClothingItem } from './types';

/** Every item added automatically that still needs checking, with quick fix, confirm and remove actions. */
export function ReviewList({
  items,
  onSave,
  onDelete,
}: {
  items: ClothingItem[];
  onSave: (item: ClothingItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const pending = itemsToReview(items);

  async function approveAll() {
    const now = new Date();
    for (const item of pending) await onSave(markReviewed(item, now));
  }

  async function remove(item: ClothingItem) {
    if (confirm(`Remove “${item.name}”? This can’t be undone.`)) await onDelete(item.id);
  }

  return (
    <>
      <div className="section-head">
        <a className="back" href={href('/clothes')} aria-label="Back to closet">
          ←
        </a>
        <h1>To review</h1>
        {pending.length > 1 && (
          <button type="button" className="filter-btn" aria-label={`Mark all ${pending.length} as reviewed`} onClick={approveAll}>
            <CheckIcon />
          </button>
        )}
      </div>
      {pending.length === 0 ? (
        <p className="muted empty">Nothing to review. New items from receipts show up here.</p>
      ) : (
        <ul className="review-list">
          {pending.map((item) => (
            <li key={item.id}>
              <a className="review-main" href={href(`/clothes/${item.id}`)}>
                <ItemThumb item={item} />
                <span className="review-info">
                  <strong>{item.name}</strong>
                  <span className="muted">{reviewSummary(item)}</span>
                </span>
              </a>
              <a className="filter-btn" href={href(`/clothes/${item.id}/edit`)} aria-label={`Edit ${item.name}`}>
                <PencilIcon />
              </a>
              <button type="button" className="filter-btn" aria-label={`Remove ${item.name}`} onClick={() => remove(item)}>
                <TrashIcon />
              </button>
              <button type="button" className="filter-btn" aria-label={`Mark ${item.name} as reviewed`} onClick={() => onSave(markReviewed(item, new Date()))}>
                <CheckIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
