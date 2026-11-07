import { useMemo } from 'react';
import { useSettings } from '../../lib/settings';
import type { Checkin } from '../checkins/types';
import { homeCountry, homeOnDate, type HomeOn } from './countries';

/** Your home country on any day: your periods (Settings → Home country), else the chosen or automatic country. */
export function useHomeOn(checkins: Pick<Checkin, 'country'>[]): HomeOn {
  const { settings } = useSettings();
  return useMemo(
    () => homeOnDate(settings.homePeriods, settings.homeCountry, homeCountry(checkins)),
    [settings.homePeriods, settings.homeCountry, checkins],
  );
}
