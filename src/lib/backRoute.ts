const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Where "back" goes from a route, or undefined on the main pages of each tab (nothing to go back to).
 * The swipe-back gesture uses it; there are no back buttons.
 */
export function parentRoute(route: string[]): string | undefined {
  const [a, b, c, d] = route;
  if (a === 'settings') return '/more';
  if (a === 'calendar') return b && DATE.test(b) ? '/calendar' : undefined;
  if (a === 'games') {
    if (b === 'night' && c) return d ? `/games/night/${c}` : '/games';
    return b === 'new' ? '/games' : undefined;
  }
  if (a === 'packing') {
    if (!b) return '/more';
    if (b === 'new') return '/packing';
    if (c === 'edit' || c === 'items' || c === 'day') return `/packing/${b}`;
    return '/packing';
  }
  if (a !== 'clothes') return undefined;
  if (!b) return undefined;
  if (b === 'review') return undefined;
  if (b === 'today') return '/calendar';
  if (b === 'calendar') return c && DATE.test(c) && d ? `/calendar/${c}` : '/calendar';
  if (b === 'outfits') {
    if (!c) return undefined;
    if (c === 'new') return '/clothes/outfits';
    return d === 'edit' ? `/clothes/outfits/${c}` : '/clothes/outfits';
  }
  if (b === 'new') return '/clothes';
  return c === 'edit' ? `/clothes/${b}` : '/clothes';
}
