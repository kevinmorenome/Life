import { useEffect, useState } from 'react';

/**
 * True while the user is scrolling down past `offset`, false as soon as they scroll back up (or are near the top).
 * Listens in the capture phase so it also sees scrolling inside a page's own box, like the calendar.
 * `resetKey` puts it back to false, e.g. when the route changes.
 */
export function useScrollingDown(resetKey: string, offset = 48) {
  const [down, setDown] = useState(false);
  useEffect(() => {
    setDown(false);
    const last = new Map<EventTarget, number>();
    // A page that positions itself on open (the calendar jumping to today) isn't the user scrolling.
    const since = performance.now();
    const onScroll = (e: Event) => {
      if (performance.now() - since < 700) return;
      const t = e.target;
      const y = Math.max(t instanceof Element ? t.scrollTop : window.scrollY, 0);
      const prev = last.get(t!) ?? 0;
      if (Math.abs(y - prev) < 6) return;
      last.set(t!, y);
      setDown(y > offset && y > prev);
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [resetKey, offset]);
  return down;
}
