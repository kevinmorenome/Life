import type { ReactNode } from 'react';

/** Small stroke icons for the stats tiles; colour comes from `currentColor`. */
function Icon({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const CalendarCheckIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" />
  </Icon>
);

export const WardrobeIcon = () => (
  <Icon>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M12 3v18M9 11v2M15 11v2" />
  </Icon>
);

export const SparkleIcon = () => (
  <Icon>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
  </Icon>
);

export const PriceTagIcon = () => (
  <Icon>
    <path d="M3 12V4h8l10 10-8 8L3 12z" />
    <circle cx="7.5" cy="8.5" r="1.2" />
  </Icon>
);

export const PencilIcon = () => (
  <Icon>
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1zM14 7l3 3" />
  </Icon>
);

export const HeartIcon = ({ filled = false }: { filled?: boolean }) => (
  <Icon filled={filled}>
    <path d="M12 20s-7.5-4.6-9.2-9.2C1.6 7.4 3.7 4.5 6.7 4.5c2 0 3.7 1.1 5.3 3 1.6-1.9 3.3-3 5.3-3 3 0 5.1 2.9 3.9 6.3C19.5 15.4 12 20 12 20z" />
  </Icon>
);

export const DotsIcon = () => (
  <Icon>
    <circle cx="12" cy="5" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="19" r="1.2" fill="currentColor" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);

export const RepeatIcon = () => (
  <Icon>
    <path d="M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4" />
  </Icon>
);
