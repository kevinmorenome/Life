import { BookIcon } from '../../icons';
import { ENTERTAINMENT, type LifeModule } from '../types';
import { BooksRoot } from './BooksRoot';
import { BooksStatsRoute } from './BooksStatsRoute';
import { useBooksCalendarLayer } from './useBooksLayer';

// Books come from a Goodreads export (Settings → Import from Goodreads) or are added in the app (#/books/add, also in the ＋ menu).
// They show on the calendar on the day you finished them, in the list at #/books and in Stats → Books.
export const booksModule: LifeModule = {
  id: 'books',
  title: 'Books',
  icon: '📚',
  description: 'What you read: shelves, ratings and a year in books. Import from Goodreads or add books yourself.',
  render: (subroute) => <BooksRoot subroute={subroute} />,
  actions: [{ label: 'Add a book', icon: <BookIcon />, path: () => '/books/add' }],
  calendarLayer: useBooksCalendarLayer,
  stats: { label: 'Books', group: ENTERTAINMENT, render: () => <BooksStatsRoute /> },
};
