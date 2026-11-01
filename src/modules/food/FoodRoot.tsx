import { useCollection } from '../../lib/useCollection';
import { ProductList } from './ProductList';
import { ProductView } from './ProductView';
import { productSummaries } from './products';
import { ReceiptForm } from './ReceiptForm';
import { ReceiptList } from './ReceiptList';
import { ReceiptView } from './ReceiptView';
import type { FoodProduct, FoodReceipt } from './types';

export function FoodRoot({ subroute }: { subroute: string[] }) {
  const receipts = useCollection<FoodReceipt>('foodreceipts');
  const products = useCollection<FoodProduct>('foodproducts');
  const [first, second, third] = subroute;

  if (receipts.loading || products.loading) return <p className="muted">Loading…</p>;

  if (first === 'new') return <ReceiptForm receipts={receipts.items} onSave={receipts.save} />;
  if (first === 'receipt' && second) {
    const receipt = receipts.items.find((r) => r.id === second);
    if (!receipt) return <p className="muted">That receipt doesn’t exist anymore.</p>;
    if (third === 'edit') return <ReceiptForm existing={receipt} receipts={receipts.items} onSave={receipts.save} />;
    return <ReceiptView receipt={receipt} onDelete={receipts.remove} />;
  }
  if (first === 'products') return <ProductList receipts={receipts.items} products={products.items} />;
  if (first === 'product' && second) {
    const product = productSummaries(receipts.items, products.items).find((p) => p.id === second);
    if (!product) return <p className="muted">That product isn’t on any receipt.</p>;
    return <ProductView key={product.id} product={product} record={products.items.find((p) => p.id === second)} onSave={products.save} />;
  }
  return <ReceiptList receipts={receipts.items} />;
}
