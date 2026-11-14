import { useMemo, useState } from 'react';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import { Empty, HBars, ReadoutColumns, Section, Tile, Toggle, type Bar } from '../clothes/charts';
import { extremes, perMonth, perYear, ratingCounts, rereads, splitTitle, summarize, topAuthors, yearsRead } from './books';
import type { Book } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const num = (n: number) => n.toLocaleString();

/** Stats → Books: what you read, from your Goodreads export. */
export function BooksStatsRoute() {
  const { items, loading } = useCollection<Book>('books');
  if (loading) return <p className="muted">Loading…</p>;
  if (!items.some((b) => b.shelf === 'read')) {
    return (
      <Section title="Nothing yet">
        <Empty>Import your Goodreads export in Settings, and the numbers build up here.</Empty>
      </Section>
    );
  }
  return <Loaded books={items} thisYear={today().slice(0, 4)} />;
}

function Loaded({ books, thisYear }: { books: Book[]; thisYear: string }) {
  const years = useMemo(() => yearsRead(books), [books]);
  const [period, setPeriod] = useState(years.includes(thisYear) ? thisYear : 'all');
  const prefix = period === 'all' ? '' : period;
  const s = useMemo(() => summarize(books, prefix), [books, prefix]);
  const authors = useMemo(() => topAuthors(books, prefix).slice(0, 10), [books, prefix]);
  const ratings = useMemo(() => ratingCounts(books, prefix), [books, prefix]);
  const { longest, shortest } = useMemo(() => extremes(books, prefix), [books, prefix]);
  const again = useMemo(() => rereads(books).slice(0, 5), [books]);
  const yearly = useMemo(() => perYear(books), [books]);
  const monthYear = prefix || years[0];
  const months = useMemo(() => (monthYear ? perMonth(books, monthYear) : []), [books, monthYear]);

  const periods = [...years.slice(0, 4).map((y) => ({ value: y, label: y })), { value: 'all', label: 'All time' }];
  const yearBars: Bar[] = yearly.map((y) => ({ key: y.year, tick: y.year.slice(2), value: y.books }));
  const monthBars: Bar[] = months.map((value, i) => ({ key: String(i), tick: MONTHS[i][0], value }));
  const ratingBars = ratings.map((value, i) => ({ key: String(i + 1), label: `${i + 1} ${i ? 'stars' : 'star'}`, value, shown: count(value, 'book') })).reverse();

  return (
    <>
      <Toggle label="Period" options={periods} value={period} onChange={setPeriod} />
      <div className="tiles">
        <Tile value={String(s.books)} label="books read" tone={0} />
        <Tile value={num(s.pages)} label="pages" tone={1} />
        <Tile value={s.avgRating == null ? '–' : s.avgRating.toFixed(1)} label={s.rated ? `average rating (${count(s.rated, 'rated book')})` : 'average rating'} tone={2} />
        <Tile value={s.books && s.pages ? num(Math.round(s.pages / s.books)) : '–'} label="pages per book, on average" tone={3} />
      </div>
      {s.undated > 0 && <p className="muted small">{count(s.undated, 'read book')} {s.undated === 1 ? 'has' : 'have'} no finish date in Goodreads, so {s.undated === 1 ? 'it is' : 'they are'} not in any year.</p>}
      {yearly.length > 1 && (
        <Section title="Books per year" note="By the day you finished them.">
          <ReadoutColumns
            bars={yearBars}
            big={(b) => count(b.value, 'book')}
            small={(b) => `${b.key} · ${num(yearly.find((y) => y.year === b.key)?.pages ?? 0)} pages`}
            initial={yearly[yearly.length - 1]?.year}
          />
        </Section>
      )}
      {months.length > 0 && (
        <Section title={`Books per month, ${monthYear}`}>
          <ReadoutColumns key={`m-${monthYear}`} bars={monthBars} color="var(--tone-orange)" big={(b) => count(b.value, 'book')} small={(b) => MONTHS[Number(b.key)]} initial={String(months.indexOf(Math.max(...months)))} />
        </Section>
      )}
      <Section title="Top authors" note="By books read in the period.">
        {authors.length === 0 ? <Empty>No books in this period.</Empty> : <HBars rows={authors.map((a) => ({ key: a.author, label: a.author, value: a.books, shown: `${count(a.books, 'book')}${a.pages ? ` · ${num(a.pages)} pages` : ''}` }))} />}
      </Section>
      <Section title="Your ratings">
        {ratings.some(Boolean) ? <HBars color="var(--tone-purple)" rows={ratingBars} /> : <Empty>No rated books in this period.</Empty>}
      </Section>
      {(longest || shortest) && (
        <Section title="Longest and shortest">
          {longest && (
            <p>
              Longest: <a href={href(`/books/${longest.id}`)}>{splitTitle(longest.title).title}</a>, {num(longest.pages!)} pages.
            </p>
          )}
          {shortest && shortest.id !== longest?.id && (
            <p>
              Shortest: <a href={href(`/books/${shortest.id}`)}>{splitTitle(shortest.title).title}</a>, {num(shortest.pages!)} pages.
            </p>
          )}
        </Section>
      )}
      {again.length > 0 && (
        <Section title="Books you read again" note="Goodreads keeps one finish date per book, so a re-read adds to the count only.">
          <HBars color="var(--tone-orange)" rows={again.map((b) => ({ key: b.id, label: splitTitle(b.title).title, value: b.readCount ?? 2, shown: `${b.readCount}×` }))} />
        </Section>
      )}
      <p className="muted small">Data comes from your Goodreads export. A newer export in Settings updates it.</p>
    </>
  );
}
