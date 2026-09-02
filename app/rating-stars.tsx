const PATH =
  "M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.47L12 17.27 6.2 20.37l1.11-6.47-4.7-4.58 6.49-.94L12 2.5z";

function Star({ kind }: { kind: "full" | "half" | "empty" }) {
  return (
    <span className={`star star-${kind}`} aria-hidden>
      <svg viewBox="0 0 24 24">
        <path d={PATH} />
      </svg>
      {kind === "half" ? (
        <svg className="star-half-fill" viewBox="0 0 24 24">
          <path d={PATH} />
        </svg>
      ) : null}
    </span>
  );
}

/** rating 为 0–10，一星=2。 */
export function RatingStars({ value }: { value: number }) {
  const n = Math.max(0, Math.min(10, Math.round(value)));
  return (
    <span className="rating-stars" title={`${n / 2} 星`} aria-label={`${n / 2} 星`}>
      {Array.from({ length: 5 }, (_, i) => {
        const threshold = (i + 1) * 2;
        const kind = n >= threshold ? "full" : n >= threshold - 1 ? "half" : "empty";
        return <Star key={i} kind={kind} />;
      })}
    </span>
  );
}
