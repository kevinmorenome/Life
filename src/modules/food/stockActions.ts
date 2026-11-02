import { newId } from '../../lib/db';
import { today } from '../../lib/format';
import { partLeft, type Stock } from './stock';
import type { StockEvent, StockEventType, Unit } from './types';

/** A new stock event dated today. Events are never edited: a mistake is fixed with a newer count. */
export function stockEvent(productId: string, type: StockEventType, quantity: number, source: StockEvent['source']): StockEvent {
  const now = new Date().toISOString();
  return { id: newId(), productId, type, quantity, date: today(), source, createdAt: now, updatedAt: now };
}

/** The use event that brings the pack in use down to `fraction` left, or undefined if that would not lower anything. */
export function partLeftEvent(productId: string, unit: Unit, stock: Pick<Stock, 'quantity'>, fraction: number, source: StockEvent['source']): StockEvent | undefined {
  const used = Math.round((stock.quantity - partLeft(stock.quantity, unit, fraction)) * 1000) / 1000;
  return used > 0 ? stockEvent(productId, 'use', used, source) : undefined;
}

/** A use, throw-away or count that is about one batch (a purchase): see `StockEvent.batch`. */
export function batchEvent(productId: string, batch: string, type: 'use' | 'toss' | 'count', quantity: number, source: StockEvent['source']): StockEvent {
  return { ...stockEvent(productId, type, quantity, source), batch };
}

/** Sets the use-by date of a batch; the newest one wins, so changing it again is just another event. */
export function expiryEvent(productId: string, batch: string, useBy: string, source: StockEvent['source']): StockEvent {
  return { ...stockEvent(productId, 'expiry', 0, source), batch, useBy };
}

/** Puts some of a batch in the freezer, or takes some of a frozen batch out: the new batch gets its own use-by (see `stockOf`). */
export function moveEvent(productId: string, batch: string, type: 'freeze' | 'thaw', quantity: number, source: StockEvent['source']): StockEvent {
  return { ...stockEvent(productId, type, quantity, source), batch };
}
