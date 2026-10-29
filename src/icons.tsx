// Line icons (24×24, currentColor), sized by CSS.
import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const HangerIcon = () => (
  <Icon>
    <path d="M12 7.5a2 2 0 1 0-2-2" />
    <path d="M12 7.5v1.2L3.6 15.1a1.5 1.5 0 0 0 .9 2.7h15a1.5 1.5 0 0 0 .9-2.7L12 8.7" />
  </Icon>
);

export const ShirtIcon = () => (
  <Icon>
    <path d="M8.5 3.5 4 5.8 2.5 10l3 1.2V20.5h13V11.2l3-1.2L20 5.8l-4.5-2.3a3.5 3.5 0 0 1-7 0Z" />
  </Icon>
);

export const CalendarIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const ChartIcon = () => (
  <Icon>
    <path d="M4 20.5h16M7 17v-5M12 17V7M17 17v-8" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const GearIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </Icon>
);

export const SuitcaseIcon = () => (
  <Icon>
    <rect x="3.5" y="7.5" width="17" height="13" rx="2.5" />
    <path d="M9 7.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2.5M9 11v6M15 11v6" />
  </Icon>
);

export const EditIcon = () => (
  <Icon>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5h10L18 7M9 7V4.5h6V7" />
  </Icon>
);

export const EyeIcon = () => (
  <Icon>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOffIcon = () => (
  <Icon>
    <path d="M3 3l18 18M10 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.8M6.6 6.9A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
);

export const UndoIcon = () => (
  <Icon>
    <path d="M4 8v5h5M4.5 13A8 8 0 1 1 7 18.5" />
  </Icon>
);

export const BuildingIcon = () => (
  <Icon>
    <path d="M5 20.5V4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9.5h3a1 1 0 0 1 1 1v10M3.5 20.5h17" />
    <path d="M8.5 7.5h3M8.5 11h3M8.5 14.5h3" />
  </Icon>
);

export const HomeIcon = () => (
  <Icon>
    <path d="M4 11.2 12 4l8 7.2V19a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19v-7.8Z" />
    <path d="M9.5 20.5v-5.5h5v5.5" />
  </Icon>
);

export const PalmIcon = () => (
  <Icon>
    <path d="M12 20.5V11M12 11C12 7 9 4.5 5 5.5c2.5.3 4.5 2 5 4.5M12 11c0-4 3-6.5 7-5.5-2.5.3-4.5 2-5 4.5M12 11c-2.5-1-5.500-.5-7.500 1.500 2.500-.5 4.500.5 6 2.500M12 11c2.500-1 5.500-.5 7.500 1.500-2.500-.5-4.500.5-6 2.500" />
  </Icon>
);
