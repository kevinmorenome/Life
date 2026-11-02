import { useRef, useState } from 'react';
import { CameraIcon, ImageIcon, SearchIcon, TrashIcon } from '../../icons';
import { IconMenu, type MenuEntry } from '../clothes/IconMenu';
import { FoodPicture, pictureClass } from './FoodPicture';
import { PhotoSearch } from './PhotoSearch';
import { foodPhoto } from './productPhoto';
import type { ProductSummary } from './products';

/**
 * A product's picture with a camera button that opens a small menu: take a photo, choose one, find one online, or
 * remove it. Photos get the same treatment as closet photos (downscaled, background removed on-device when possible).
 */
export function PictureControl({ product, className, size = 64, onPhoto }: { product: ProductSummary; className: string; size?: number; onPhoto(photo: string | null): Promise<void> | void }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(false);
  const [error, setError] = useState('');

  async function fromFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await onPhoto(await foodPhoto(file));
    } catch {
      setError('Could not use that photo.');
    }
    setBusy(false);
  }

  const entries: MenuEntry[] = [
    { label: 'Take a photo', icon: <CameraIcon />, onSelect: () => camera.current?.click() },
    { label: 'Choose a photo', icon: <ImageIcon />, onSelect: () => library.current?.click() },
    { label: 'Find a picture online', icon: <SearchIcon />, onSelect: () => setSearch(true) },
    ...(product.photo ? [{ label: 'Remove the picture', icon: <TrashIcon />, onSelect: () => void onPhoto(null) }] : []),
  ];

  return (
    <div className="food-pic">
      <span className={`${pictureClass(product)} ${className}`}>
        <FoodPicture product={product} size={size} />
        {busy && <span className="food-pic-busy">Working on it…</span>}
      </span>
      <div className="food-pic-menu">
        <IconMenu entries={entries} label={product.photo ? 'Change the picture' : 'Add a picture'} icon={<CameraIcon />} triggerClassName="food-pic-btn" />
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void fromFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={library} type="file" accept="image/*" hidden onChange={(e) => { void fromFile(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p className="small food-pic-error" role="alert">{error}</p>}
      {search && <PhotoSearch name={product.name} onPick={(photo) => onPhoto(photo)} onClose={() => setSearch(false)} />}
    </div>
  );
}
