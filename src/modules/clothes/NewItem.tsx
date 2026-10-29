import { useState } from 'react';
import { newId } from '../../lib/db';
import { navigate } from '../../lib/router';
import { ItemDetail } from './ItemDetail';
import type { ClothingItem, Outfit } from './types';

/** A blank item shown on the normal item page. Edits stay in memory until Save. */
export function NewItem({ items, outfits, onSave }: { items: ClothingItem[]; outfits: Outfit[]; onSave: (item: ClothingItem) => Promise<void> }) {
  const [draft, setDraft] = useState<ClothingItem>(() => {
    const now = new Date().toISOString();
    return { id: newId(), name: '', category: 'tops', seasons: [], status: 'active', wears: [], createdAt: now, updatedAt: now };
  });
  return (
    <ItemDetail
      item={draft}
      items={items}
      outfits={outfits}
      onSave={async (next) => setDraft(next)}
      onDelete={async () => {}}
      draft={{
        canSave: draft.name.trim() !== '',
        onCancel: () => navigate('/clothes'),
        onSave: async () => {
          const now = new Date().toISOString();
          await onSave({ ...draft, name: draft.name.trim(), updatedAt: now });
          navigate(`/clothes/${draft.id}`);
        },
      }}
    />
  );
}
