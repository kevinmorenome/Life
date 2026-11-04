import { useDbProblem } from './lib/useDbProblem';

/** Explains a stuck "Loading…": the local database is waiting for another open copy of the app, or couldn't open. */
export function DbProblemBanner() {
  const problem = useDbProblem();
  if (!problem) return null;
  return (
    <div className="db-problem" role="alert">
      {problem === 'blocked' ? (
        <p>
          Life is still open in another tab or app window, so it can’t finish updating. Close the other copy (swipe the app away, or close the other
          Safari tab) and this page loads by itself.
        </p>
      ) : (
        <>
          <p>The data on this device couldn’t be opened.</p>
          <button className="btn" onClick={() => location.reload()}>
            Reload
          </button>
        </>
      )}
    </div>
  );
}
