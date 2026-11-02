import { FoodPicture, pictureClass } from './FoodPicture';
import type { Entry } from './stockEntries';
import { tileInfo } from './stockTiles';

/** One product on the stock grid: its picture, how much is left, and (for fresh food) how long it will keep. Tap opens the actions. */
export function StockTile({ entry, today, onOpen }: { entry: Entry; today: string; onOpen(id: string): void }) {
  const { product: p } = entry;
  const info = tileInfo(entry, today);
  return (
    <li>
      <button type="button" className={`food-tile${entry.stock.quantity <= 0 ? ' food-tile-gone' : ''}`} aria-label={info.label} onClick={() => onOpen(p.id)}>
        <span className={pictureClass(p)}>
          <FoodPicture product={p} />
          <span className="food-badge">{info.badge}</span>
          {info.bar && (
            <span className="food-bar" aria-hidden>
              <span className={`lvl-${info.bar.level}`} style={{ width: `${info.bar.pct}%` }} />
            </span>
          )}
        </span>
        <span className="food-name">{p.name}</span>
        {info.pill && <span className={`food-pill lvl-${info.pill.level}`}>{info.pill.text}</span>}
      </button>
    </li>
  );
}
