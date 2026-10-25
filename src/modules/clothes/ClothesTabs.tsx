import { href } from '../../lib/router';

const TABS = [
  { id: 'closet', label: 'Closet', path: '/clothes' },
  { id: 'outfits', label: 'Outfits', path: '/clothes/outfits' },
  { id: 'stats', label: 'Stats', path: '/clothes/stats' },
] as const;

export function ClothesTabs({ active }: { active: (typeof TABS)[number]['id'] }) {
  return (
    <div className="tabs" role="tablist">
      {TABS.map((t) => (
        <a key={t.id} role="tab" aria-selected={active === t.id} href={href(t.path)}>
          {t.label}
        </a>
      ))}
    </div>
  );
}
