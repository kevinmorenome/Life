import { TrashIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import type { Play } from './types';
import { episodeCode } from './watched';

/** What the confirmation calls the play: "Severance S02E05", or the movie's title. */
export const playName = (p: Play): string => [p.title, episodeCode(p)].filter(Boolean).join(' ');

/**
 * Removes one play from the app after a confirmation. Trakt is not touched, and the play isn't fetched
 * again: the Worker never overwrites a record that was deleted.
 */
export function RemovePlayButton({ play }: { play: Play }) {
  const { remove } = useCollection<Play>('watched');
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={`Remove ${playName(play)}`}
      onClick={() => {
        if (confirm(`Remove “${playName(play)}” from your history here? It stays on Trakt.`)) void remove(play.id);
      }}
    >
      <TrashIcon />
    </button>
  );
}
