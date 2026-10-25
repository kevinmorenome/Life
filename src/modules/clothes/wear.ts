interface Wearable {
  wears: string[];
  updatedAt: string;
}

export function withWear<T extends Wearable>(item: T, date: string): T {
  return { ...item, wears: [...item.wears, date].sort(), updatedAt: new Date().toISOString() };
}

export function withoutWear<T extends Wearable>(item: T, index: number): T {
  return { ...item, wears: item.wears.filter((_, i) => i !== index), updatedAt: new Date().toISOString() };
}
