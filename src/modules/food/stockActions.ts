import { newId } from '../../lib/db';
import { today } from '../../lib/format';
import type { StockEvent, StockEventType } from './types';

/** A new stock event dated today. Events are never edited: a mistake is fixed with a newer count. */
export function stockEvent(productId: string, type: StockEventType, quantity: number, source: StockEvent['source']): StockEvent {
  const now = new Date().toISOString();
  return { id: newId(), productId, type, quantity, date: today(), source, createdAt: now, updatedAt: now };
}
