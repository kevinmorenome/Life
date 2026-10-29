import { navigate } from '../../lib/router';

/** Switches between the closet and the outfits; the bottom bar only has a Closet tab. */
export function ClosetTabs({ active }: { active: 'closet' | 'outfits' }) {
  const tabs = [
    { id: 'closet', label: 'Items', path: '/clothes' },
    { id: 'outfits', label: 'Outfits', path: '/clothes/outfits' },
  ] as const;
  return (
    <div className="seg" role="tablist" aria-label="Closet sections" style={{ ['--tabs' as string]: tabs.length }}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} onClick={() => active !== t.id && navigate(t.path)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
