import { useEffect, useRef, useState } from 'react';
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
  const img = useRef<HTMLImageElement>(null);
  const [inset, setInset] = useState({ top: 0, right: 0 });

  // The photo is letterboxed (object-fit: contain) inside its box, so pin the ✕
  // to the corner of what's actually painted, not of the box.
  useEffect(() => {
    const el = img.current;
    if (!el || !onRemove) return;
    const measure = () => {
      if (!el.naturalWidth || !el.clientWidth || !el.clientHeight) return;
      const scale = Math.min(el.clientWidth / el.naturalWidth, el.clientHeight / el.naturalHeight);
      setInset({
        top: (el.clientHeight - el.naturalHeight * scale) / 2,
        right: (el.clientWidth - el.naturalWidth * scale) / 2,
      });
    };
    measure();
    el.addEventListener('load', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('load', measure);
      ro.disconnect();
    };
  }, [item.photo, onRemove]);

  const body = item.photo ? (
    <img ref={img} src={item.photo} alt={onRemove ? item.name : ''} loading="lazy" />
  ) : (
    <span className="board-placeholder">{item.name}</span>
  );
  if (!onRemove) return body;
  return (
    <span className="board-piece">
      {body}
      <button
        type="button"
        className="piece-x"
        style={{ top: inset.top + 2, right: inset.right + 2 }}
        aria-label={`Remove ${item.name}`}
        onClick={() => onRemove(item.id)}
      >
        ✕
      </button>
    </span>
  );
}
