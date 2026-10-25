import { useCollection } from '../../lib/useCollection';
import { ClothesList } from './ClothesList';
import { ClothesStatsView } from './ClothesStats';
import { ItemDetail } from './ItemDetail';
import { ItemForm } from './ItemForm';
import type { ClothingItem } from './types';

export function ClothesRoot({ subroute }: { subroute: string[] }) {
  const { items, loading, save, remove } = useCollection<ClothingItem>('clothes');
  const [first, second] = subroute;

  if (loading) return <p className="muted">Loading…</p>;

  if (first === 'new') return <ItemForm onSave={save} />;
  if (first === 'stats') return <ClothesStatsView items={items} />;
  if (first) {
    const item = items.find((i) => i.id === first);
    if (!item) return <p className="muted">That item doesn’t exist anymore.</p>;
    if (second === 'edit') return <ItemForm existing={item} onSave={save} />;
    return <ItemDetail item={item} onSave={save} onDelete={remove} />;
  }
  return <ClothesList items={items} onSave={save} />;
}
