import { ENTERTAINMENT, type LifeModule } from '../types';
import { BooksRoot } from './BooksRoot';
import { BooksStatsRoute } from './BooksStatsRoute';
import { useBooksCalendarLayer } from './useBooksLayer';

// Books come from a Goodreads export (Settings → Import from Goodreads). They show on the calendar on the day you finished them,
// in the list at #/books (Reading | To read | Read) and in Stats → Books.
export const booksModule: LifeModule = {
  id: 'books',
  title: 'Books',
  icon: '📚',
  description: 'What you read, imported from Goodreads: shelves, ratings and a year in books.',
  render: (subroute) => <BooksRoot subroute={subroute} />,
  actions: [],
  calendarLayer: useBooksCalendarLayer,
  stats: { label: 'Books', group: ENTERTAINMENT, render: () => <BooksStatsRoute /> },
};
