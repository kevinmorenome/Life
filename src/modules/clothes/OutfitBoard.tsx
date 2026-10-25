import { boardLayout } from './board';
import type { ClothingItem } from './types';

/**
 * An outfit drawn as a flat lay: tops side by side at the top, bottoms
 * below, shoes at the bottom, accessories in the corner. Cut-out photos
 * float on the card with no tiles.
 */
export function OutfitBoard({ pieces, large = false }: { pieces: ClothingItem[]; large?: boolean }) {
  const b = boardLayout(pieces);
  const rows = (['upper', 'lower', 'feet'] as const).filter((z) => b[z].length);
  return (
    <div className={`board${large ? ' board-large' : ''} rows-${rows.join('-') || 'none'}`} aria-hidden>
      {rows.map((zone) => (
        <div key={zone} className={`board-row board-${zone} n-${b[zone].length}`}>
          {b[zone].map((p) => (
            <Piece key={p.id} item={p} />
          ))}
        </div>
      ))}
      {b.extra.length > 0 && (
        <div className="board-extra">
          {b.extra.map((p) => (
            <Piece key={p.id} item={p} />
          ))}
        </div>
      )}
      {b.hidden > 0 && <span className="board-more">+{b.hidden}</span>}
    </div>
  );
}

function Piece({ item }: { item: ClothingItem }) {
  return item.photo ? (
    <img src={item.photo} alt="" loading="lazy" />
  ) : (
    <span className="board-placeholder">{item.name}</span>
  );
}
