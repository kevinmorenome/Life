/** Your rating as five stars you can tap: the one you tap sets it, tapping the current rating takes it away. */
export function RatingInput({ rating, onRate }: { rating?: number; onRate: (stars: number) => void }) {
  return (
    <span className="rating-input" role="group" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={`rating-star${rating && n <= rating ? ' on' : ''}`} aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`} aria-pressed={rating === n} onClick={() => onRate(n)}>
          ★
        </button>
      ))}
    </span>
  );
}
