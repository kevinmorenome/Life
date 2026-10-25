import type { ReactNode } from 'react';

/** A destination in the bottom tab bar. */
export interface ModuleTab {
  id: string;
  label: string;
  icon: ReactNode;
  /** Route path, e.g. "/clothes/outfits". */
  path: string;
  /** Whether this tab is active for the module's subroute. */
  matches(subroute: string[]): boolean;
}

/** An entry in the ＋ menu. */
export interface ModuleAction {
  label: string;
  icon: ReactNode;
  /** Computed when the menu opens, so it can depend on the date. */
  path(): string;
}

/**
 * A feature area of the app (clothes, and later others). Each module owns
 * every route under `#/<id>/...` and receives the path segments after its id.
 */
export interface LifeModule {
  id: string;
  title: string;
  /** Emoji shown on the home screen. */
  icon: string;
  description: string;
  render(subroute: string[]): ReactNode;
  /** Bottom tab bar destinations; the ＋ button sits in the middle. */
  tabs: ModuleTab[];
  actions: ModuleAction[];
  /** Hide the bottom bar (e.g. on forms with their own bottom actions). */
  hideNav?(subroute: string[]): boolean;
}
