import type { ClothingItem } from './types';

/** A flat colour swatch as a stand-in product photo. */
const swatch = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#f4f2ec"/><rect x="40" y="40" width="120" height="120" rx="18" fill="${fill}"/></svg>`)}`;

/**
 * Items shaped like what `add_receipt_items` creates, for trying out the review
 * flow in a PR preview. Ids are fixed so adding them twice changes nothing.
 */
export function sampleReviewItems(now: Date): ClothingItem[] {
  const stamp = now.toISOString();
  const base: Pick<ClothingItem, 'seasons' | 'status' | 'wears' | 'needsReview' | 'createdAt' | 'updatedAt'> = {
    seasons: [],
    status: 'active',
    wears: [],
    needsReview: true,
    createdAt: stamp,
    updatedAt: stamp,
  };
  return [
    { ...base, id: 'sample-receipt-1', name: 'Slim fit stretch polo shirt', category: 'tops', subcategory: 'Polo shirt', brand: 'Lacoste', colors: ['Navy'], color: 'Navy', size: 'M', material: 'Cotton, Elastane', price: 89.9, purchaseDate: '2026-10-20', seasons: ['spring', 'summer'], notes: 'Sample receipt · order 1042', photo: swatch('#1f3a5f') },
    { ...base, id: 'sample-receipt-2', name: 'Leather Chelsea boots', category: 'shoes', subcategory: 'Boots', brand: 'Zara', colors: ['Black'], color: 'Black', size: '42', price: 119, purchaseDate: '2026-10-20', seasons: ['fall', 'winter'], notes: 'Sample receipt · order 1042', photo: swatch('#161616') },
    { ...base, id: 'sample-receipt-3', name: 'Relaxed straight jeans', category: 'bottoms', subcategory: 'Jeans', brand: 'Levi’s', colors: ['Blue'], color: 'Blue', size: '32/32', material: 'Cotton', price: 99.5, purchaseDate: '2026-10-22', notes: 'Sample receipt · order 2210', photo: swatch('#4a6fa5') },
    // No photo and little detail, like an email that said little.
    { ...base, id: 'sample-receipt-4', name: 'Wool scarf', category: 'accessories', purchaseDate: '2026-10-25', notes: 'Sample receipt · order 3307' },
  ];
}
