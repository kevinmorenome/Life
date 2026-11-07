/** Where a check-in or plan came from, as a small logo (drawn here, simplified) instead of a word. */
export type Source = 'swarm' | 'tripit';

const NAME: Record<Source, string> = { swarm: 'Swarm', tripit: 'TripIt' };

function SwarmLogo() {
  return (
    <>
      <ellipse cx="6.8" cy="6.4" rx="5.4" ry="3.1" transform="rotate(12 6.8 6.4)" fill="currentColor" />
      <ellipse cx="13.9" cy="4.2" rx="1.8" ry="3.3" transform="rotate(14 13.9 4.2)" fill="currentColor" />
      <g transform="rotate(-24 16 15.4) translate(0.4 0.6)">
      <path d="M15.6 9.2C16.9 13 16.7 17.6 15.4 21.4 12.5 20.8 10.3 18.6 10.2 15.4 10.1 12.3 12.4 10 15.6 9.2Z" fill="currentColor" />
      <path d="M17.7 9.2C21 9.2 23.4 11.8 23.4 14.8 23.4 17.6 21.2 19.8 18.6 20.2 17.4 17.4 17.9 12.6 17.7 9.2Z" fill="currentColor" />
      </g>
      <path d="M9 14.4 6.6 20.2 11.4 19.4Z" fill="currentColor" />
    </>
  );
}

function TripitLogo() {
  const blue = '#0b84c6';
  const ring = { stroke: '#fff', strokeWidth: 1.2 };
  return (
    <>
      <rect width="24" height="24" rx="5.5" fill="#f99a22" />
      <g stroke={blue} strokeWidth="1.5" strokeLinecap="round">
        <path d="M8 9.6V6.6M10.6 10.6 14.4 8M11.2 13H17.6M10.4 15.6 13 17.6" />
      </g>
      <ellipse cx="8" cy="13" rx="3.6" ry="3.1" fill="none" {...ring} />
      <circle cx="8" cy="5.6" r="2.3" fill={blue} {...ring} />
      <circle cx="15.2" cy="7.5" r="1.5" fill={blue} {...ring} />
      <circle cx="18.6" cy="13" r="2.4" fill={blue} {...ring} />
      <circle cx="13.8" cy="18" r="1.7" fill={blue} {...ring} />
    </>
  );
}

/** One source's logo, named for screen readers and as a tooltip. */
export function SourceLogo({ source }: { source: Source }) {
  return (
    <svg className={`source-logo source-${source}`} viewBox="0 0 24 24" role="img" aria-label={NAME[source]}>
      <title>{NAME[source]}</title>
      {source === 'swarm' ? <SwarmLogo /> : <TripitLogo />}
    </svg>
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
