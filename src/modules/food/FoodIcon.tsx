import type { IconKind } from './foodIcons';

const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** The drawn picture on a tile (until a product has a real photo). Decorative: the tile's label names the product. */
export function FoodIcon({ kind, size = 56 }: { kind: IconKind; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden {...common}>
      {PATHS[kind]}
    </svg>
  );
}

const PATHS: Record<IconKind, React.ReactNode> = {
  bottle: (
    <>
      <path d="M20 5h8v5h-8z" />
      <path d="M28 7h6c2 0 3 1 3 3" />
      <path d="M17 14h14c2 0 3 1 3 3v22c0 2-1 3-3 3H17c-2 0-3-1-3-3V17c0-2 1-3 3-3z" />
      <path d="M14 26h20" />
    </>
  ),
  chicken: (
    <>
      <path d="M32 8c7 0 12 6 10 13-1 5-6 9-11 9-3 0-5-1-7-3-2-2-3-4-3-7 0-6 5-12 11-12z" />
      <path d="M22 28L11 39" />
      <circle cx="9" cy="37" r="3" />
      <circle cx="13" cy="42" r="3" />
    </>
  ),
  cucumber: (
    <>
      <rect x="6" y="19" width="36" height="12" rx="6" transform="rotate(-35 24 25)" />
      <circle cx="19" cy="27" r="1" fill="currentColor" />
      <circle cx="25" cy="23" r="1" fill="currentColor" />
      <circle cx="31" cy="19" r="1" fill="currentColor" />
    </>
  ),
  pepper: (
    <>
      <path d="M24 14c-9 0-14 7-13 15 1 8 6 13 13 13s12-5 13-13c-1-8-4-15-13-15z" />
      <path d="M24 14v-5M24 9c2-2 5-2 7-1" />
      <path d="M19 22c-2 3-2 7 0 10" />
    </>
  ),
  carrot: (
    <>
      <path d="M31 13c5 0 9 4 8 9L17 41c-2 2-5 1-6-1l-3-3c-2-1-2-4 0-5z" />
      <path d="M34 12l5-7M38 17l7-3" />
      <path d="M22 24l4 4M17 30l4 4" />
    </>
  ),
  jar: (
    <>
      <rect x="14" y="7" width="20" height="7" rx="2" />
      <path d="M13 14h22v22a5 5 0 0 1-5 5H18a5 5 0 0 1-5-5z" />
      <path d="M13 23h22M13 32h22" />
    </>
  ),
  pasta: (
    <>
      <path d="M8 28c0-9 7-15 16-15s16 6 16 15c0 4-4 6-8 6-3 0-4-2-8-2s-5 2-8 2c-4 0-8-2-8-6z" />
      <path d="M17 22c2-3 6-4 9-3M21 28c1-2 3-3 5-3" />
    </>
  ),
  milk: (
    <>
      <path d="M16 9h16l5 8v23H11V17z" />
      <path d="M11 17h26M32 9l5 8" />
      <path d="M19 28c2-2 4 2 6 0s3-1 4 0" />
    </>
  ),
  can: (
    <>
      <rect x="14" y="7" width="20" height="34" rx="4" />
      <path d="M14 14h20M14 34h20M20 24h8" />
    </>
  ),
  chips: (
    <>
      <path d="M13 8h22l-2 33H15z" />
      <path d="M13 13h22M14 36h20" />
      <circle cx="24" cy="25" r="4.5" />
    </>
  ),
  nuts: (
    <>
      <path d="M20 8c5 0 8 4 8 8 0 3-2 4-2 6s2 3 2 6c0 5-3 9-8 9s-8-4-8-9c0-3 2-4 2-6s-2-3-2-6c0-4 3-8 8-8z" transform="rotate(30 24 24)" />
      <path d="M19 17h2M22 25h2M18 31h2" />
    </>
  ),
  spice: (
    <>
      <rect x="17" y="6" width="14" height="7" rx="3" />
      <path d="M15 13h18l2 8v17a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4V21z" />
      <path d="M14 25h20M20 31h8M20 36h8" />
    </>
  ),
  oil: (
    <>
      <path d="M21 6h6v7c0 3 5 5 5 10v15a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V23c0-5 5-7 5-10z" />
      <path d="M16 27h16M16 34h16" />
    </>
  ),
  box: (
    <>
      <path d="M8 16l16-8 16 8v18l-16 8-16-8z" />
      <path d="M8 16l16 8 16-8M24 24v18" />
    </>
  ),
};
