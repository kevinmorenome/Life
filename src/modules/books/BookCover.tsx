import { usePhoto } from '../../lib/usePhoto';
import { splitTitle } from './books';
import type { Book } from './types';

/**
 * The book's cover (loaded on demand, `usePhoto`), or a tinted tile: its first letter, or with `label` its title (for
 * a grid of covers, where the tile is all there is to tell books apart). Size and shape come from `className`.
 */
export function BookCover({ book, className = '', label = false }: { book: Book; className?: string; label?: boolean }) {
  const src = usePhoto('books', { id: book.id, photo: book.photo, hasPhoto: book.hasPhoto });
  const title = splitTitle(book.title).title;
  return (
    <span className={`book-cover${src ? ' has-photo' : ''} ${className}`.trim()} aria-hidden>
      {src ? <img src={src} alt="" /> : label ? <span className="book-cover-title">{title}</span> : title.slice(0, 1).toUpperCase()}
    </span>
  );
}
