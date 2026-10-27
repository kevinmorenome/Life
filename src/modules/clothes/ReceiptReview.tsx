import { useState } from 'react';
import type { ReceiptDraft } from '../../../worker/protocol';
import { newId } from '../../lib/db';
import { money } from '../../lib/format';
import { href } from '../../lib/router';
import { CheckIcon, CloseIcon } from './icons';
import { draftToItem } from './receipts';
import { label, type ClothingItem } from './types';

/** Clothes found in forwarded receipts. Nothing joins the closet until it is accepted here. */
export function ReceiptReview({
  drafts,
  onSaveItem,
  onRemoveDraft,
}: {
  drafts: ReceiptDraft[];
  onSaveItem: (item: ClothingItem) => Promise<void>;
  onRemoveDraft: (id: string) => Promise<void>;
}) {
  // Lines the owner crossed out, as `draftId:index`.
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  async function accept(draft: ReceiptDraft) {
    const now = new Date();
    // New items first, then the draft goes: a crash in between shows the receipt again rather than losing it.
    for (const [i, line] of draft.items.entries()) {
      if (!skipped.has(`${draft.id}:${i}`)) await onSaveItem(draftToItem(line, newId(), now));
    }
    await onRemoveDraft(draft.id);
  }

  return (
    <>
      <a className="back" href={href('/clothes')} aria-label="Back to closet">
        ←
      </a>
      <h1>Receipts</h1>
      {drafts.length === 0 && <p className="muted empty">Nothing to review. Forward a receipt email to add clothes.</p>}
      {drafts.map((draft) => (
        <section key={draft.id} className="receipt-draft">
          <div className="section-head">
            <h2>{draft.subject}</h2>
            <span>
              <button type="button" className="filter-btn" aria-label="Dismiss receipt" onClick={() => onRemoveDraft(draft.id)}>
                <CloseIcon />
              </button>
              <button type="button" className="filter-btn" aria-label="Add to closet" onClick={() => accept(draft)}>
                <CheckIcon />
              </button>
            </span>
          </div>
          <ul className="receipt-lines">
            {draft.items.map((line, i) => {
              const key = `${draft.id}:${i}`;
              return (
                <li key={key} className={skipped.has(key) ? 'is-skipped' : undefined}>
                  {line.imageUrl ? <img src={line.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="receipt-noimg" />}
                  <span className="receipt-info">
                    <strong>{line.name}</strong>
                    <span className="muted">
                      {[line.brand, label(line.category), line.colors?.join(', '), line.size, line.price != null ? money(line.price) : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="filter-btn"
                    aria-label={skipped.has(key) ? `Include ${line.name}` : `Skip ${line.name}`}
                    aria-pressed={skipped.has(key)}
                    onClick={() => toggle(key)}
                  >
                    <CloseIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
