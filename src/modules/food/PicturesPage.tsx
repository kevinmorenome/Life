import { useState } from 'react';
import { CameraIcon, ImageIcon, SearchIcon } from '../../icons';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { FoodPicture, pictureClass } from './FoodPicture';
import { PhotoSearch } from './PhotoSearch';
import { needsPicture } from './pictures';
import { productRecord } from './productEdits';
import { stockEntries } from './stockEntries';
import type { FoodProduct, FoodReceipt, StockEvent } from './types';
import { usePicturePicker } from './usePicturePicker';

/** Walks through the products you have that have no picture yet, one at a time: photograph it, pick one, or skip. */
export function PicturesPage({ receipts, products, events, onProduct }: { receipts: FoodReceipt[]; products: FoodProduct[]; events: StockEvent[]; onProduct(p: FoodProduct): Promise<void> }) {
  const queue = needsPicture(stockEntries(receipts, products, events, today()));
  const [total] = useState(queue.length);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [search, setSearch] = useState(false);
  const todo = queue.filter((e) => !skipped.includes(e.product.id));
  const current = todo[0];
  const position = total - todo.length + 1;

  // Saving gives the product a picture, so it leaves the queue and the next one appears by itself.
  const picker = usePicturePicker((photo) => (current ? onProduct(productRecord(current.product, products.find((p) => p.id === current.product.id), { photo }, new Date().toISOString())) : undefined));

  if (!current) {
    return (
      <>
        <h1 className="page-title">Add pictures</h1>
        <div className="empty">
          <p className="muted">
            {total === 0
              ? 'Everything you have already has a picture.'
              : skipped.length === 0
                ? 'All done.'
                : `Done. ${skipped.length} skipped ${skipped.length === 1 ? 'stays' : 'stay'} on the list for next time.`}
          </p>
          <a className="btn btn-primary game-new" href={href('/food/stock')}>
            Back to stock
          </a>
        </div>
      </>
    );
  }

  const p = current.product;
  return (
    <section className="food-pass" key={p.id}>
      <h1 className="page-title">Add pictures</h1>
      <p className="muted small" aria-live="polite">
        {position} of {total}
      </p>
      <div className="food-pass-bar" aria-hidden>
        <span style={{ width: `${Math.round(((position - 1) / total) * 100)}%` }} />
      </div>
      <span className={`${pictureClass(p)} food-art-pass`}>
        <FoodPicture product={p} size={84} />
        {picker.busy && <span className="food-pic-busy">Working on it…</span>}
      </span>
      <h2>{p.name}</h2>
      <p className="muted small">
        {p.storage[0].toUpperCase()}
        {p.storage.slice(1)} · bought {shortDate(p.purchases[0].date)}
      </p>
      <div className="food-pass-actions">
        <button type="button" className="btn btn-primary" onClick={picker.takePhoto} disabled={picker.busy}>
          <CameraIcon /> Take a photo
        </button>
        <button type="button" className="btn" onClick={picker.choosePhoto} disabled={picker.busy}>
          <ImageIcon /> Choose a photo
        </button>
        <button type="button" className="btn" onClick={() => setSearch(true)} disabled={picker.busy}>
          <SearchIcon /> Find one online
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setSkipped((s) => [...s, p.id])} disabled={picker.busy}>
          Skip for now
        </button>
      </div>
      {picker.error && (
        <p className="small food-pic-error-inline" role="alert">
          {picker.error}
        </p>
      )}
      <p className="muted small">The first photo takes a little longer: the app downloads the background remover once.</p>
      {picker.inputs}
      {search && <PhotoSearch name={p.name} rawName={p.purchases[0]?.rawName} onPick={(photo) => onProduct(productRecord(p, products.find((x) => x.id === p.id), { photo }, new Date().toISOString()))} onClose={() => setSearch(false)} />}
    </section>
  );
}
