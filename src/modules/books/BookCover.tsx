import { usePhoto } from '../../lib/usePhoto';
import { splitTitle } from './books';
import type { Book } from './types';

/** The book's cover (loaded on demand, `usePhoto`), or a tinted tile with its first letter. Size and shape come from `className`. */
export function BookCover({ book, className = '' }: { book: Book; className?: string }) {
  const src = usePhoto('books', { id: book.id, photo: book.photo, hasPhoto: book.hasPhoto });
  return (
    <span className={`book-cover${src ? ' has-photo' : ''} ${className}`.trim()} aria-hidden>
      {src ? <img src={src} alt="" /> : splitTitle(book.title).title.slice(0, 1).toUpperCase()}
    </span>
  );
}
