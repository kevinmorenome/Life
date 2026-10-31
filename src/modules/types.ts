import type { ReactNode } from 'react';

/** An entry in the ＋ menu. */
export interface ModuleAction {
  label: string;
  icon: ReactNode;
  /** Computed when the menu opens, so it can depend on the date. */
  path(): string;
}

/**
 * What a module adds to the shared calendar. The calendar is where modules meet:
 * each one can mark days, show a summary above the month, and add a section to the day screen.
 */
export interface DayMark {
  /** Colour family: `mark-<tone>` classes in styles.css. */
  tone: string;
  icon: ReactNode;
  /** Short text, e.g. "Office". */
  label: string;
  /** Extra line when zoomed in, e.g. "09:10 – 18:05". */
  detail?: string;
  /**
   * One labelled pill per entry when fully zoomed in, instead of `detail`/`label`: the ones that fit
   * are shown and a "more" pill counts the rest. The dot and badge look are unchanged.
   */
  tiles?: string[];
}

export interface CalendarLayer {
  /** Oldest date (YYYY-MM-DD) the module has something for, so the month list can scroll back that far. */
  earliest?: string;
  /** How the day is marked: a dot when zoomed out, an icon badge by default, a labelled pill when zoomed in. */
  mark?(date: string): DayMark | null;
  /** Shown above the month grid; `month` is YYYY-MM. */
  header?(month: string): ReactNode;
  /** Section on the day screen. */
  daySection?(date: string): ReactNode;
}

/** A module's page in the Stats tab, under its own heading. */
export interface ModuleStats {
  label: string;
  /** `subroute` is what follows `#/stats/<module id>`. */
  render(subroute: string[]): ReactNode;
}

/**
 * A feature area of the app (clothes, and later others). Each module owns
 * every route under `#/<id>/...` and receives the path segments after its id.
 * The bottom bar belongs to the app (see nav.tsx), not to modules.
 */
export interface LifeModule {
  id: string;
  title: string;
  /** Emoji shown on the home screen. */
  icon: string;
  description: string;
  render(subroute: string[]): ReactNode;
  /** Entries this module adds to the ＋ menu. */
  actions: ModuleAction[];
  /** False to leave the module off the More page (it has no pages of its own). */
  listed?: boolean;
  /** Called as a hook by the calendar on every render, so it can load its own data. */
  calendarLayer?: () => CalendarLayer;
  stats?: ModuleStats;
  /** Hide the bottom bar (e.g. on forms with their own bottom actions). */
  hideNav?(subroute: string[]): boolean;
}
