import { boardLayout } from './board';
import type { ClothingItem } from './types';

/**
 * An outfit drawn as a flat lay: tops side by side at the top, bottoms
 * below, shoes at the bottom, accessories in the corner. Cut-out photos
 * float on the card with no tiles.
 */
export function OutfitBoard({
  pieces,
  large = false,
  onRemove,
}: {
  pieces: ClothingItem[];
  large?: boolean;
  /** When given, every piece gets a small ✕ in its top-right corner (the outfit editor's canvas). */
  onRemove?: (id: string) => void;
}) {
  const b = boardLayout(pieces);
  const rows = (['upper', 'lower', 'feet'] as const).filter((z) => b[z].length);
  return (
    <div className={`board${large ? ' board-large' : ''} rows-${rows.join('-') || 'none'}`} aria-hidden={onRemove ? undefined : true}>
      {rows.map((zone) => (
        <div key={zone} className={`board-row board-${zone} n-${b[zone].length}`}>
          {b[zone].map((p) => (
            <Piece key={p.id} item={p} onRemove={onRemove} />
          ))}
        </div>
      ))}
      {b.extra.length > 0 && (
        <div className="board-extra">
          {b.extra.map((p) => (
            <Piece key={p.id} item={p} onRemove={onRemove} />
          ))}
        </div>
      )}
      {b.hidden > 0 && <span className="board-more">+{b.hidden}</span>}
    </div>
  );
}

function Piece({ item, onRemove }: { item: ClothingItem; onRemove?: (id: string) => void }) {
  const body = item.photo ? (
    <img src={item.photo} alt={onRemove ? item.name : ''} loading="lazy" />
  ) : (
    <span className="board-placeholder">{item.name}</span>
  );
  if (!onRemove) return body;
  return (
    <span className="board-piece">
      {body}
      <button type="button" className="piece-x" aria-label={`Remove ${item.name}`} onClick={() => onRemove(item.id)}>
        ✕
      </button>
    </span>
  );
}
