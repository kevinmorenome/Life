import { navigate } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import { AddBook } from './AddBook';
import { BookDetail } from './BookDetail';
import { BookList } from './BookList';
import type { Book } from './types';

/** `#/books` (the shelves) and `#/books/<id>` (one book). */
export function BooksRoot({ subroute }: { subroute: string[] }) {
  const { items, loading, save, remove } = useCollection<Book>('books');
  if (loading) return <p className="muted">Loading…</p>;
  const [id] = subroute;
  if (id === 'add') return <AddBook books={items} onSave={save} />;
  if (id) {
    const book = items.find((b) => b.id === id);
    return book ? (
      <BookDetail
        book={book}
        onSave={save}
        onRemove={async () => {
          await remove(book.id);
          navigate('/books');
        }}
      />
    ) : <p className="muted">That book isn’t here anymore.</p>;
  }
  return <BookList books={items} />;
}
