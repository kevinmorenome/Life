import { useEffect, useState } from 'react';

/** True while the page is scrolled down: hides on the way down, returns as soon as you scroll up. */
export function useHideOnScroll(offset = 56) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = Math.max(window.scrollY, 0);
      if (Math.abs(y - last) < 6) return;
      setHidden(y > offset && y > last);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [offset]);
  return hidden;
}
