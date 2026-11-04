import { useSyncExternalStore } from 'react';
import { getDbProblem, onDbProblem, type DbProblem } from './db';

/** Why the local database isn't answering, or null while it is fine. */
export const useDbProblem = (): DbProblem => useSyncExternalStore(onDbProblem, getDbProblem);
