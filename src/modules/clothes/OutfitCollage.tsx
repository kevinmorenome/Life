import { ItemThumb } from './ItemThumb';
import type { ClothingItem } from './types';

/** Up to four piece photos in a 2×2 grid, with a "+N" for the rest. */
export function OutfitCollage({ pieces }: { pieces: ClothingItem[] }) {
  const shown = pieces.slice(0, 4);
  const extra = pieces.length - shown.length;
  return (
    <div className="collage" aria-hidden>
      {shown.map((p, i) => (
        <div key={p.id} className="collage-cell">
          <ItemThumb item={p} />
          {extra > 0 && i === shown.length - 1 && <span className="collage-more">+{extra}</span>}
        </div>
      ))}
    </div>
  );
}
