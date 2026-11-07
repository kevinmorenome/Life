import { countryByCode } from './countries';
import { flagEmoji } from './flag';

/** A country's flag, named for screen readers. Draws nothing for a code that is not a country. */
export function Flag({ code }: { code: string | undefined }) {
  const emoji = flagEmoji(code);
  const country = code ? countryByCode(code) : undefined;
  if (!emoji || !country) return null;
  return (
    <span className="flag" role="img" aria-label={country.name}>
      {emoji}
    </span>
  );
}
