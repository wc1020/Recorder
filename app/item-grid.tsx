import Link from "next/link";
import { Cover } from "./cover";
import { RatingStars } from "./rating-stars";
import { formatRating, statusLabel, type MediaType } from "@/lib/constants";
import { cardSubtitle, movieCardFacts, parseExtra } from "@/lib/media-extra";

export type GridItem = {
  id: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  coverUrl: string | null;
  extraJson: string | null;
  entry: { status: string; rating: number | null; review: string | null } | null;
};

export function ItemGrid({ type, items }: { type: MediaType; items: GridItem[] }) {
  return (
    <div className="grid">
      {items.map((item) => {
        const extra = parseExtra(item.extraJson);
        const sub = cardSubtitle(type, item.year, extra);
        const status = item.entry?.status;
        const rating = item.entry?.rating ?? null;
        const statusName = item.entry ? statusLabel(item.entry.status, type) : "—";
        const showStars = status === "done" && rating != null;
        const statusTitle = showStars ? `${statusName} · ${formatRating(rating)}` : statusName !== "—" ? statusName : undefined;
        return (
          <Link key={item.id} href={`/item/${item.id}`} className="card">
            <Cover url={item.coverUrl} title={item.title} />
            <div className="card-body">
              <p className="card-title" title={item.title}>
                <span>{item.title}</span>
              </p>
              {type === "movie" || type === "tv" ? (
                <dl className="card-stats">
                  {movieCardFacts(type, item.year, extra).map((row) => (
                    <div key={row.k} className="card-stat">
                      <dt>{row.k}</dt>
                      <dd title={row.title ?? (row.v !== "—" ? row.v : undefined)}>{row.v}</dd>
                    </div>
                  ))}
                  <div className="card-stat">
                    <dt>状态</dt>
                    <dd className={showStars ? "card-stat-rating" : undefined} title={statusTitle}>
                      <span className="stat-text">{statusName}</span>
                      {showStars && rating != null ? <RatingStars value={rating} /> : null}
                    </dd>
                  </div>
                </dl>
              ) : (
                <>
                  {sub.text ? (
                    <p className="card-sub" title={sub.text}>
                      {sub.text}
                    </p>
                  ) : null}
                  <p className="card-meta">
                    {item.entry ? statusLabel(item.entry.status, type) : ""}
                    {item.entry?.rating != null ? ` · ${formatRating(item.entry.rating)}` : ""}
                  </p>
                  {item.entry?.review ? (
                    <p className="card-review" title={item.entry.review}>
                      {item.entry.review}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
