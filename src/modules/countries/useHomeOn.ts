import { useMemo } from 'react';
import { useSettings } from '../../lib/settings';
import type { Checkin } from '../checkins/types';
import { homeCountry, homeOnDate, homePlaceOnDate, type HomeOn, type HomePlaceOn } from './countries';

/**
 * Your home on any day (Settings → Home country): `homeOn` the country, `placeOn` the country and, when you gave one,
 * the city. Your periods first, else the chosen or automatic country.
 */
export function useHomeOn(checkins: Pick<Checkin, 'country'>[]): { homeOn: HomeOn; placeOn: HomePlaceOn } {
  const { settings } = useSettings();
  return useMemo(() => {
    const auto = homeCountry(checkins);
    return { homeOn: homeOnDate(settings.homePeriods, settings.homeCountry, auto), placeOn: homePlaceOnDate(settings.homePeriods, settings.homeCountry, auto) };
  }, [settings.homePeriods, settings.homeCountry, checkins]);
}
