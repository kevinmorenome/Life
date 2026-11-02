import { FoodIcon } from './FoodIcon';
import { iconKind } from './foodIcons';
import { isFlatPhoto } from './productPhoto';
import type { ProductSummary } from './products';

/** A product's picture, or the drawn icon until it has one. Decorative: whatever shows it names the product. */
export function FoodPicture({ product, size = 56 }: { product: Pick<ProductSummary, 'name' | 'type' | 'unit' | 'photo'>; size?: number }) {
  if (product.photo) return <img className="food-photo" src={product.photo} alt="" draggable={false} />;
  return <FoodIcon kind={iconKind(product.name, product.type, product.unit)} size={size} />;
}

/** The colour class for the tile behind the picture. */
export const pictureClass = (product: Pick<ProductSummary, 'name' | 'type' | 'unit' | 'photo'>): string =>
  product.photo ? `food-art has-photo${isFlatPhoto(product.photo) ? ' photo-flat' : ''}` : `food-art k-${iconKind(product.name, product.type, product.unit)}`;
