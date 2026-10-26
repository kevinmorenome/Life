import type { SyncState } from './lib/sync';
import { useSyncStatus } from './lib/useSyncStatus';

export const SYNC_LABELS: Record<SyncState, string> = {
  idle: 'Starting…',
  syncing: 'Syncing…',
  synced: 'Synced',
  offline: 'Offline',
  'signed-out': 'Signed out',
  'not-configured': 'Sync not set up',
  'local-only': 'This device only',
  error: 'Sync error',
};

const TONE: Record<SyncState, 'ok' | 'busy' | 'warn' | 'muted'> = {
  idle: 'busy',
  syncing: 'busy',
  synced: 'ok',
  offline: 'warn',
  'signed-out': 'warn',
  'not-configured': 'warn',
  'local-only': 'muted',
  error: 'warn',
};

/** Amber dot for the You tab: only shown when sync needs attention or changes are waiting. */
export function SyncBadge() {
  const { state, pending } = useSyncStatus();
  if (TONE[state] !== 'warn' && !pending) return null;
  const title = pending ? `${SYNC_LABELS[state]} · ${pending} change(s) waiting` : SYNC_LABELS[state];
  return <span className="sync-badge" role="img" aria-label={title} />;
}
