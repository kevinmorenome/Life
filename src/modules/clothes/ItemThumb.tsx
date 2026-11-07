import { usePhoto } from '../../lib/usePhoto';
import type { ClothingItem } from './types';

const ICONS: Record<string, string> = {
  tops: '👕',
  bottoms: '👖',
  dresses: '👗',
  outerwear: '🧥',
  shoes: '👟',
  accessories: '🧢',
  bags: '👜',
  jewelry: '💍',
  swimwear: '👙',
  activewear: '🩳',
  sleepwear: '🩱',
  underwear: '🧦',
  other: '🏷️',
};

export function ItemThumb({ item, large = false }: { item: ClothingItem; large?: boolean }) {
  const cls = large ? 'thumb thumb-large' : 'thumb';
  const photo = usePhoto('clothes', item);
  if (photo) return <img className={cls} src={photo} alt="" />;
  return (
    <div className={`${cls} thumb-empty`} aria-hidden>
      {ICONS[item.category]}
    </div>
  );
}
