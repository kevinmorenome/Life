import { useEffect } from 'react';
import { href } from '../../lib/router';
import { closetPath, rememberClosetView, type ClosetView } from './closetView';

/** Items | Outfits toggle that heads both halves of the Closet tab. */
export function ClosetSwitch({ view }: { view: ClosetView }) {
  useEffect(() => rememberClosetView(view), [view]);
  return (
    <nav className="segmented" aria-label="Closet">
      {(['items', 'outfits'] as const).map((v) => (
        <a key={v} href={href(closetPath(v))} aria-current={v === view ? 'page' : undefined}>
          {v === 'items' ? 'Items' : 'Outfits'}
        </a>
      ))}
    </nav>
  );
}
