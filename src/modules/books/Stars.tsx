/** Your rating as five stars (filled up to the rating), named for screen readers; nothing when the book isn't rated. */
export function Stars({ rating }: { rating?: number }) {
  if (!rating) return null;
  return (
    <span className="book-stars" role="img" aria-label={`${rating} out of 5`}>
      {'★'.repeat(rating)}
      <span className="book-stars-off" aria-hidden>
        {'★'.repeat(5 - rating)}
      </span>
    </span>
  );
}
