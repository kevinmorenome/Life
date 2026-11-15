import { useMemo } from 'react';
import { DayWidget } from '../../DayWidget';
import { BookIcon } from '../../icons';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import type { CalendarLayer } from '../types';
import { authorLine, byDate, splitTitle } from './books';
import { Stars } from './Stars';
import type { Book } from './types';

/** Books you finished, on the shared calendar: a mark on the day and a Finished reading widget on the day screen. */
export function useBooksCalendarLayer(): CalendarLayer {
  const { items } = useCollection<Book>('books');
  const days = useMemo(() => byDate(items), [items]);
  const names = (list: Book[]) => list.map((b) => splitTitle(b.title).title);

  return {
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      return { tone: 'book', icon: <BookIcon />, label: list.length === 1 ? names(list)[0] : `${list.length} books`, tiles: names(list) };
    },
    daySection(date) {
      const list = days.get(date);
      if (!list) return null;
      return (
        <DayWidget id="books" title="Finished reading" icon={<BookIcon />} tone="book" size="full" badge={list.length > 1 ? list.length : undefined} summary={names(list).join(', ')}>
          <ul className="widget-list">
            {list.map((b) => (
              <li key={b.id}>
                <a className="book-day-row" href={href(`/books/${b.id}`)}>
                  <strong>{splitTitle(b.title).title}</strong>
                  <span className="muted small">
                    {authorLine(b)} <Stars rating={b.rating} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </DayWidget>
      );
    },
  };
}
