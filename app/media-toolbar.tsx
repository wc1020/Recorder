"use client";

import { useRouter } from "next/navigation";
import { MEDIA_SORTS, type MediaType } from "@/lib/constants";
import { mediaPageHref, mediaSortOf, type MediaListQuery } from "@/lib/list-href";

export function MediaToolbar({
  type,
  query,
  genres,
}: {
  type: MediaType;
  query: MediaListQuery;
  genres: string[];
}) {
  const router = useRouter();
  const sort = mediaSortOf(query);

  function go(next: MediaListQuery) {
    router.push(mediaPageHref(type, next));
  }

  return (
    <div className="media-toolbar">
      <label className="media-select">
        <span className="muted">排序</span>
        <select
          value={sort}
          onChange={(e) => {
            const value = e.target.value;
            go({ ...query, sort: value === "added" ? undefined : value });
          }}
        >
          {MEDIA_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="media-select">
        <span className="muted">类型</span>
        <select
          value={query.genre ?? "all"}
          onChange={(e) => {
            const value = e.target.value;
            go({ ...query, genre: value === "all" ? undefined : value });
          }}
        >
          <option value="all">全部</option>
          {genres.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
