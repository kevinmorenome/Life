import type { ClothingItem } from './types';

export function withWear(item: ClothingItem, date: string): ClothingItem {
  return { ...item, wears: [...item.wears, date].sort(), updatedAt: new Date().toISOString() };
}

export function withoutWear(item: ClothingItem, index: number): ClothingItem {
  return { ...item, wears: item.wears.filter((_, i) => i !== index), updatedAt: new Date().toISOString() };
}
