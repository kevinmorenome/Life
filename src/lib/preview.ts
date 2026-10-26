/**
 * Set at build time for PR preview versions (e.g. "PR #3"); undefined in
 * production. Previews read your real data but never upload changes.
 */
export const PREVIEW_LABEL: string | undefined = import.meta.env.VITE_PREVIEW_LABEL || undefined;

/** Subject line of the PR's last commit, shown in the preview banner. */
export const PREVIEW_COMMIT: string | undefined = import.meta.env.VITE_PREVIEW_COMMIT || undefined;
