import { useCollection } from '../../lib/useCollection';
import { ReceiptForm } from './ReceiptForm';
import { ReceiptList } from './ReceiptList';
import { ReceiptView } from './ReceiptView';
import type { FoodReceipt } from './types';

export function FoodRoot({ subroute }: { subroute: string[] }) {
  const receipts = useCollection<FoodReceipt>('foodreceipts');
  const [first, second, third] = subroute;

  if (receipts.loading) return <p className="muted">Loading…</p>;

  if (first === 'new') return <ReceiptForm receipts={receipts.items} onSave={receipts.save} />;
  if (first === 'receipt' && second) {
    const receipt = receipts.items.find((r) => r.id === second);
    if (!receipt) return <p className="muted">That receipt doesn’t exist anymore.</p>;
    if (third === 'edit') return <ReceiptForm existing={receipt} receipts={receipts.items} onSave={receipts.save} />;
    return <ReceiptView receipt={receipt} onDelete={receipts.remove} />;
  }
  return <ReceiptList receipts={receipts.items} />;
}
