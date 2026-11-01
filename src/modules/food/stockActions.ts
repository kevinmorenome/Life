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
