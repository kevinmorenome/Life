import { useState } from 'react';
import { CameraIcon, ImageIcon, SearchIcon, TrashIcon } from '../../icons';
import { IconMenu, type MenuEntry } from '../clothes/IconMenu';
import { FoodPicture, pictureClass, useProductPhoto } from './FoodPicture';
import { PhotoSearch } from './PhotoSearch';
import { usePicturePicker } from './usePicturePicker';
import type { ProductSummary } from './products';

/**
 * A product's picture with a camera button that opens a small menu: take a photo, choose one, find one online, or
 * remove it. Photos get the same treatment as closet photos (downscaled, background removed on-device when possible).
 */
export function PictureControl({ product, className, size = 64, onPhoto }: { product: ProductSummary; className: string; size?: number; onPhoto(photo: string | null): Promise<void> | void }) {
  const [search, setSearch] = useState(false);
  const photo = useProductPhoto(product);
  const { inputs, busy, error, takePhoto, choosePhoto } = usePicturePicker(onPhoto);

  const entries: MenuEntry[] = [
    { label: 'Take a photo', icon: <CameraIcon />, onSelect: takePhoto },
    { label: 'Choose a photo', icon: <ImageIcon />, onSelect: choosePhoto },
    { label: 'Find a picture online', icon: <SearchIcon />, onSelect: () => setSearch(true) },
    ...(product.hasPhoto ? [{ label: 'Remove the picture', icon: <TrashIcon />, onSelect: () => void onPhoto(null) }] : []),
  ];

  return (
    <div className="food-pic">
      <span className={`${pictureClass(product, photo)} ${className}`}>
        <FoodPicture product={product} photo={photo} size={size} />
        {busy && <span className="food-pic-busy">Working on it…</span>}
      </span>
      <div className="food-pic-menu">
        <IconMenu entries={entries} label={product.hasPhoto ? 'Change the picture' : 'Add a picture'} icon={<CameraIcon />} triggerClassName="food-pic-btn" />
      </div>
      {inputs}
      {error && <p className="small food-pic-error" role="alert">{error}</p>}
      {search && <PhotoSearch name={product.name} rawName={product.purchases[0]?.rawName} onPick={(photo) => onPhoto(photo)} onClose={() => setSearch(false)} />}
    </div>
  );
}
