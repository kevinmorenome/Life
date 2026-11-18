import { VenueView } from './VenueView';
import { WhatIEat } from './WhatIEat';

/** `#/wolt` (What I eat) and `#/wolt/venue/<name>`. */
export function TakeoutRoot({ subroute }: { subroute: string[] }) {
  if (subroute[0] === 'venue' && subroute[1]) return <VenueView venue={decodeURIComponent(subroute[1])} />;
  return <WhatIEat />;
}
