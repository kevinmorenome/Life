import { usePhoto } from '../../lib/usePhoto';
import { FoodIcon } from './FoodIcon';
import { iconKind } from './foodIcons';
import { isFlatPhoto } from './productPhoto';
import type { ProductSummary } from './products';

type Pictured = Pick<ProductSummary, 'id' | 'name' | 'type' | 'unit' | 'hasPhoto'>;

/** The product's picture as a data URL, loaded from the local photos store (undefined while loading, or without one). */
export const useProductPhoto = (product: Pick<ProductSummary, 'id' | 'hasPhoto'> | undefined): string | undefined =>
  usePhoto('foodproducts', product && { id: product.id, hasPhoto: product.hasPhoto });

/** A product's picture, or the drawn icon until it has one. Decorative: whatever shows it names the product. Pass what `useProductPhoto` returned. */
export function FoodPicture({ product, photo, size = 56 }: { product: Pictured; photo: string | undefined; size?: number }) {
  if (photo) return <img className="food-photo" src={photo} alt="" draggable={false} />;
  if (product.hasPhoto) return null; // still loading: the tile keeps its place
  return <FoodIcon kind={iconKind(product.name, product.type, product.unit)} size={size} />;
}

/** The colour class for the tile behind the picture. */
export const pictureClass = (product: Pictured, photo: string | undefined): string =>
  product.hasPhoto ? `food-art has-photo${isFlatPhoto(photo) ? ' photo-flat' : ''}` : `food-art k-${iconKind(product.name, product.type, product.unit)}`;
