// Older links (bookmarks, items in the sync log) from before the calendar and stats became app-level.
// Returns where such a path now lives, or null when it's current.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

export function legacyRedirect(route: string[]): string | null {
  const [a, b, c] = route;
  if (a === 'clothes' && b === 'calendar' && route.length <= 3) {
    if (!c) return '/calendar';
    if (MONTH.test(c) || DATE.test(c)) return `/calendar/${c}`;
  }
  if (a === 'clothes' && b === 'stats') return `/stats/clothes${c ? `/${c}` : ''}`;
  if (a === 'work') {
    if (b === 'stats') return '/stats/work';
    if (b === 'day' && c && DATE.test(c)) return `/calendar/${c}`;
    if (b === 'calendar' && c && MONTH.test(c)) return `/calendar/${c}`;
    return '/calendar';
  }
  return null;
}
