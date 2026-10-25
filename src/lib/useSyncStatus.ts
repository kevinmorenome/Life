import { useSyncExternalStore } from 'react';
import { getStatus, subscribe } from './sync';

export function useSyncStatus() {
  return useSyncExternalStore(subscribe, getStatus);
}
