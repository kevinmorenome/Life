import { useCollection } from '../../lib/useCollection';
import { ClothesStatsView } from './ClothesStats';
import type { ClothingItem } from './types';

export function ClothesStatsRoute({ tab }: { tab?: string }) {
  const { items, loading } = useCollection<ClothingItem>('clothes');
  if (loading) return <p className="muted">Loading…</p>;
  return <ClothesStatsView items={items} tab={tab} />;
}
