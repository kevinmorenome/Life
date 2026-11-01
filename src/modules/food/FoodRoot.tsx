import { useCollection } from '../../lib/useCollection';
import { ReceiptList } from './ReceiptList';
import { ReceiptView } from './ReceiptView';
import type { FoodReceipt } from './types';

export function FoodRoot({ subroute }: { subroute: string[] }) {
  const receipts = useCollection<FoodReceipt>('foodreceipts');
  const [first, second] = subroute;

  if (receipts.loading) return <p className="muted">Loading…</p>;

  if (first === 'receipt' && second) {
    const receipt = receipts.items.find((r) => r.id === second);
    if (!receipt) return <p className="muted">That receipt doesn’t exist anymore.</p>;
    return <ReceiptView receipt={receipt} onDelete={receipts.remove} />;
  }
  return <ReceiptList receipts={receipts.items} />;
}
