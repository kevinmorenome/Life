import { useMemo } from 'react';
import { useSettings } from '../../lib/settings';
import type { Checkin } from '../checkins/types';
import { homeCountry, homeOnDate, homePlaceOnDate, makeAwayOf, type AwayOf, type HomeOn, type HomePlaceOn } from './countries';

/**
 * Your home on any day (Settings → Home country): `homeOn` the country, `placeOn` the country and, when you gave one,
 * the city, `awayOf` how far from home a check-in was. Your periods first, else the chosen or automatic country.
 */
export function useHomeOn(checkins: Pick<Checkin, 'country' | 'city' | 'lat' | 'lng'>[]): { homeOn: HomeOn; placeOn: HomePlaceOn; awayOf: AwayOf } {
  const { settings } = useSettings();
  return useMemo(() => {
    const auto = homeCountry(checkins);
    const placeOn = homePlaceOnDate(settings.homePeriods, settings.homeCountry, auto);
    return { homeOn: homeOnDate(settings.homePeriods, settings.homeCountry, auto), placeOn, awayOf: makeAwayOf(placeOn, checkins) };
  }, [settings.homePeriods, settings.homeCountry, checkins]);
}
