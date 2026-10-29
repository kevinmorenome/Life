export type WorkStatus = 'office' | 'home' | 'off';

/** A day set by hand. Wins over anything the check-in Shortcut reported. id = YYYY-MM-DD. */
export interface WorkDay {
  id: string;
  status: WorkStatus;
  updatedAt: string;
}

/**
 * What the Shortcut reported (via the Worker's check-in endpoint): arriving at
 * or leaving the office, or an end-of-day "not at the office". Always a fresh
 * record, so it can never clobber a day edited by hand.
 */
export interface WorkEvent {
  id: string;
  type: 'arrive' | 'leave' | 'home';
  /** YYYY-MM-DD, local to where the phone was. */
  date: string;
  /** HH:MM, local. */
  time: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** How the monthly number of days is read. */
export type WorkTargetKind = 'min-office' | 'max-home';

export const DEFAULT_TARGET = 7;
/** Home days allowed in a month when you request more. */
export const DEFAULT_EXTENDED = 10;
