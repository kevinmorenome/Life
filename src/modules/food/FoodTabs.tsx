import { useEffect, useRef } from 'react';
import { navigate } from '../../lib/router';

/**
 * Switches between receipts, stock, the shopping list, the product search and the recipes (their own module,
 * `#/recipes`). Five don't fit at 390px, so the switch scrolls sideways like the Stats one, with the open tab in view.
 */
export function FoodTabs({ active }: { active: 'receipts' | 'stock' | 'shopping' | 'products' | 'recipes' }) {
  const bar = useRef<HTMLDivElement>(null);
  const tabs = [
    { id: 'receipts', label: 'Receipts', path: '/food' },
    { id: 'stock', label: 'Stock', path: '/food/stock' },
    { id: 'shopping', label: 'Shopping', path: '/food/shopping' },
    { id: 'products', label: 'Products', path: '/food/products' },
    { id: 'recipes', label: 'Recipes', path: '/recipes' },
  ] as const;

  useEffect(() => {
    const box = bar.current;
    const el = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (box && el) box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
  }, [active]);

  return (
    <div ref={bar} className="seg seg-scroll" role="tablist" aria-label="Food sections">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} onClick={() => active !== t.id && navigate(t.path)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
