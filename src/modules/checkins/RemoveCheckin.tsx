import { TrashIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import type { Checkin } from './types';

/**
 * Removes one Swarm check-in from the app after a confirmation. Swarm is not touched, and the check-in isn't
 * fetched again: the Worker never overwrites a record that was deleted.
 */
export function RemoveCheckinButton({ checkin }: { checkin: Checkin }) {
  const { remove } = useCollection<Checkin>('checkins');
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={`Remove check-in at ${checkin.venue}`}
      onClick={() => {
        if (confirm(`Remove “${checkin.venue}” from your check-ins here? It stays on Swarm.`)) void remove(checkin.id);
      }}
    >
      <TrashIcon />
    </button>
  );
}
