import type { ReactNode } from 'react';

/**
 * A feature area of the app (clothes, and later others). Each module owns
 * every route under `#/<id>/...` and receives the path segments after its id.
 */
export interface LifeModule {
  id: string;
  title: string;
  /** Emoji shown on the home screen and in navigation. */
  icon: string;
  description: string;
  render(subroute: string[]): ReactNode;
}
