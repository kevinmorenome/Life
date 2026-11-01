import { useEffect } from 'react';
import { navigate } from './router';

const COMMIT = 80; // px to the right that count as a swipe
const SKIP = 'input, textarea, select, [role="slider"], [data-no-swipe-back], .sheet-backdrop, .review-backdrop, .filter-page, .menu, .cal-scroll';

/** True if the touch started inside something that scrolls sideways (a carousel, the category tabs). */
function scrollsSideways(el: Element | null): boolean {
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const x = getComputedStyle(el).overflowX;
      if (x === 'auto' || x === 'scroll') return true;
    }
  }
  return false;
}

/**
 * Swipe right anywhere on the page to go to `parent`. The page follows the finger a little and springs back
 * when the swipe is too short or too steep. Does nothing when `parent` is undefined.
 */
export function useSwipeBack(parent: string | undefined, page: () => HTMLElement | null) {
  useEffect(() => {
    if (!parent) return;
    let start: { x: number; y: number } | undefined;
    let dragging = false;
    const el = () => page();
    const reset = (animate: boolean) => {
      const node = el();
      if (!node) return;
      node.style.transition = animate ? 'transform 0.25s ease, opacity 0.25s ease' : '';
      node.style.transform = '';
      node.style.opacity = '';
      if (animate) setTimeout(() => (node.style.transition = ''), 260);
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      const target = e.target instanceof Element ? e.target : null;
      start = e.touches.length === 1 && !target?.closest(SKIP) && !scrollsSideways(target) ? { x: t.clientX, y: t.clientY } : undefined;
      dragging = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!dragging) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          start = undefined; // vertical scroll: leave the page alone (a stray transform breaks position: fixed children)
          return;
        }
        if (dx > 12 && dx > Math.abs(dy) * 1.5) dragging = true;
        else return;
      }
      const node = el();
      if (node) {
        node.style.transform = `translateX(${Math.max(dx, 0) * 0.4}px)`;
        node.style.opacity = String(1 - Math.min(Math.max(dx, 0) / 400, 0.4));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || !dragging) return;
      const dx = e.changedTouches[0].clientX - start.x;
      start = undefined;
      dragging = false;
      reset(dx < COMMIT);
      if (dx >= COMMIT) navigate(parent);
    };
    const onCancel = () => {
      if (dragging) reset(true);
      start = undefined;
      dragging = false;
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      reset(false);
    };
  }, [parent, page]);
}
