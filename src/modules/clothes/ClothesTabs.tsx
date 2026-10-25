import { href } from '../../lib/router';

export function ClothesTabs({ active }: { active: 'closet' | 'stats' }) {
  return (
    <div className="tabs" role="tablist">
      <a role="tab" aria-selected={active === 'closet'} href={href('/clothes')}>
        Closet
      </a>
      <a role="tab" aria-selected={active === 'stats'} href={href('/clothes/stats')}>
        Stats
      </a>
    </div>
  );
}
