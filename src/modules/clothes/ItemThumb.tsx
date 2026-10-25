import type { ClothingItem } from './types';

const ICONS: Record<string, string> = {
  tops: '👕',
  bottoms: '👖',
  dresses: '👗',
  outerwear: '🧥',
  shoes: '👟',
  accessories: '🧢',
  activewear: '🩳',
  sleepwear: '🩱',
  underwear: '🧦',
  other: '🏷️',
};

export function ItemThumb({ item, large = false }: { item: ClothingItem; large?: boolean }) {
  const cls = large ? 'thumb thumb-large' : 'thumb';
  if (item.photo) return <img className={cls} src={item.photo} alt="" />;
  return (
    <div className={`${cls} thumb-empty`} aria-hidden>
      {ICONS[item.category]}
    </div>
  );
}
