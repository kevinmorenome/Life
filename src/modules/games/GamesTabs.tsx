import { navigate } from '../../lib/router';

/** Switches between game nights, players and games; the bottom bar only has one Games tab. */
export function GamesTabs({ active }: { active: 'nights' | 'players' | 'titles' }) {
  const tabs = [
    { id: 'nights', label: 'Nights', path: '/games' },
    { id: 'players', label: 'Players', path: '/games/players' },
    { id: 'titles', label: 'Games', path: '/games/titles' },
  ] as const;
  return (
    <div className="seg" role="tablist" aria-label="Games sections" style={{ ['--tabs' as string]: tabs.length }}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} onClick={() => active !== t.id && navigate(t.path)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
