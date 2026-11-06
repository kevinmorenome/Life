import { describe, expect, it } from 'vitest';
import { flagEmoji } from './flag';

describe('flagEmoji', () => {
  it('turns an ISO code into its flag, in either case', () => {
    expect(flagEmoji('HR')).toBe('🇭🇷');
    expect(flagEmoji('pt')).toBe('🇵🇹');
  });
  it('gives nothing for anything that is not two letters', () => {
    for (const bad of [undefined, '', 'H', 'HRV', '12', 'H1', ' H']) expect(flagEmoji(bad)).toBeUndefined();
  });
});
