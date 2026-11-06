/**
 * A country's flag as an emoji: the two letters of its ISO 3166-1 alpha-2 code as regional indicator symbols
 * ("HR" → 🇭🇷). Undefined for anything that is not two letters. (Windows has no flag emoji and shows the letters.)
 */
export function flagEmoji(code: string | undefined): string | undefined {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return undefined;
  return [...code.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}
