/**
 * "Don't count this in statistics": while it is on, what you log still changes the stock (and shows in the history),
 * but is left out of waste and use counts. For when you are catching up on things you used or threw out earlier.
 */
export function StatsSwitch({ off, onChange }: { off: boolean; onChange(off: boolean): void }) {
  return (
    <div className="stats-switch">
      <button type="button" className="chip" aria-pressed={off} onClick={() => onChange(!off)}>
        Not in statistics
      </button>
      {off && (
        <span className="small stats-switch-note" role="status">
          What you log now changes the stock but isn’t counted in statistics.
        </span>
      )}
    </div>
  );
}
