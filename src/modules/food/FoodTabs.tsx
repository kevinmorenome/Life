import { navigate } from '../../lib/router';

/** Switches between receipts and products; Food has one place in More. */
export function FoodTabs({ active }: { active: 'receipts' | 'products' }) {
  const tabs = [
    { id: 'receipts', label: 'Receipts', path: '/food' },
    { id: 'products', label: 'Products', path: '/food/products' },
  ] as const;
  return (
    <div className="seg" role="tablist" aria-label="Food sections" style={{ ['--tabs' as string]: tabs.length }}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} onClick={() => active !== t.id && navigate(t.path)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
