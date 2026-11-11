import { DayWidget } from '../../DayWidget';
import { PotIcon } from '../../icons';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import type { CalendarLayer } from '../types';
import { cookedByDate } from './cookStats';
import type { Recipe } from './types';

/** What you cooked on the shared calendar: a pot on the day and a Cooked widget on the day screen. */
export function useRecipesCalendarLayer(): CalendarLayer {
  const recipes = useCollection<Recipe>('recipes');
  const byDate = cookedByDate(recipes.items);
  const days = [...byDate.keys()].sort();

  return {
    earliest: days[0],
    mark(date) {
      const day = byDate.get(date);
      if (!day) return null;
      return {
        tone: 'cook',
        icon: <PotIcon />,
        label: day.length === 1 ? day[0].name : `Cooked ${day.length}`,
        detail: day.map((r) => r.name).join(', '),
        tiles: day.map((r) => r.name),
      };
    },
    daySection(date) {
      const day = byDate.get(date);
      if (!day) return null;
      return (
        <DayWidget id="cook" title="Cooked" icon={<PotIcon />} tone="cook" badge={day.length > 1 ? day.length : undefined} summary={day.map((r) => r.name).join(', ')}>
          <ul className="widget-list">
            {day.map((r) => {
              const times = new Set(r.cooked ?? []).size;
              const nth = [...new Set(r.cooked ?? [])].sort().indexOf(date) + 1;
              return (
                <li key={r.id}>
                  <a className="widget-link" href={href(`/recipes/${r.id}`)}>
                    <strong>{r.name}</strong>
                    <span className="muted small">{nth === 1 ? 'First time' : `${nth}${ordinal(nth)} time`}{times > nth ? ` of ${times}` : ''}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </DayWidget>
      );
    },
  };
}

/** "st", "nd", "rd", "th" for 1, 2, 3, 4… (11–13 are "th"). */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
