import { describe, expect, it } from 'vitest';
import { abroadCountry } from './useCheckinsLayer';
import type { Checkin } from './types';

const ci = (country: string | undefined) => ({ country }) as Checkin;

describe('abroadCountry', () => {
  it('is the foreign country with most of the day\'s check-ins', () => {
    expect(abroadCountry([ci('Croatia'), ci('Austria'), ci('Austria'), ci('Italy')], 'HR')).toBe('AT');
  });
  it('is nothing on a day at home, or when home is unknown', () => {
    expect(abroadCountry([ci('Croatia'), ci(undefined), ci('Atlantis')], 'HR')).toBeUndefined();
    expect(abroadCountry([ci('Austria')], undefined)).toBeUndefined();
  });
});
