/** Which half of the Closet (items or outfits) was open last, so the Closet tab returns to it. */
export type ClosetView = 'items' | 'outfits';

const KEY = 'life.closetView';

export function lastClosetView(): ClosetView {
  try {
    return localStorage.getItem(KEY) === 'outfits' ? 'outfits' : 'items';
  } catch {
    return 'items';
  }
}

export function rememberClosetView(view: ClosetView) {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // Private mode or blocked storage: the tab just falls back to items.
  }
}

export const closetPath = (view: ClosetView) => (view === 'outfits' ? '/clothes/outfits' : '/clothes');
