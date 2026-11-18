import { navigate } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import { BillDetail } from './BillDetail';
import { BillForm } from './BillForm';
import { BillList } from './BillList';
import type { UtilityBill } from './types';

/** `#/home` (the bills), `#/home/new`, `#/home/<id>` and `#/home/<id>/edit`. */
export function HomeRoot({ subroute }: { subroute: string[] }) {
  const { items, loading, save, remove } = useCollection<UtilityBill>('utilitybills');
  if (loading) return <p className="muted">Loading…</p>;
  const [id, sub] = subroute;
  if (id === 'new') return <BillForm onSave={save} />;
  if (id) {
    const bill = items.find((b) => b.id === id);
    if (!bill) return <p className="muted">That bill isn’t here anymore.</p>;
    if (sub === 'edit') return <BillForm bill={bill} onSave={save} />;
    return (
      <BillDetail
        bill={bill}
        onSave={save}
        onRemove={async () => {
          await remove(bill.id);
          navigate('/home');
        }}
      />
    );
  }
  return <BillList bills={items} />;
}
