import swarmLogo from './logos/swarm.png';
import tripitLogo from './logos/tripit.png';

/** Where a check-in or plan came from, as the service's own small logo instead of a word. */
export type Source = 'swarm' | 'tripit';

const NAME: Record<Source, string> = { swarm: 'Swarm', tripit: 'TripIt' };

/**
 * One source's logo, named for screen readers and as a tooltip. Swarm's bee is a one-colour shape, so it is drawn in
 * the text colour (light and dark mode); TripIt's is its orange tile.
 */
export function SourceLogo({ source }: { source: Source }) {
  return source === 'swarm' ? (
    <span className="source-logo source-swarm" role="img" aria-label={NAME.swarm} title={NAME.swarm} style={{ maskImage: `url(${swarmLogo})`, WebkitMaskImage: `url(${swarmLogo})` }} />
  ) : (
    <img className="source-logo source-tripit" src={tripitLogo} alt={NAME.tripit} title={NAME.tripit} />
  );
}

/** One or more logos, side by side. */
export function SourceLogos({ sources }: { sources: Source[] }) {
  return (
    <span className="source-logos">
      {sources.map((s) => (
        <SourceLogo key={s} source={s} />
      ))}
    </span>
  );
}
