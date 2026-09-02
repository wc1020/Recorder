"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ItemGrid, type GridItem } from "./item-grid";
import { MediaToolbar } from "./media-toolbar";
import type { MediaType } from "@/lib/constants";
import type { MediaListQuery } from "@/lib/list-href";

function qKey(type: MediaType): string {
  return `pm-media-q:${type}`;
}

export function MediaResults({
  type,
  query,
  genres,
  items,
  empty,
}: {
  type: MediaType;
  query: MediaListQuery;
  genres: string[];
  items: GridItem[];
  empty: ReactNode;
}) {
  const showSearch = type === "movie" || type === "tv";
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!showSearch) return;
    setQ(sessionStorage.getItem(qKey(type)) ?? "");
  }, [type, showSearch]);

  function update(next: string) {
    setQ(next);
    if (!showSearch) return;
    const key = qKey(type);
    if (next.trim()) sessionStorage.setItem(key, next);
    else sessionStorage.removeItem(key);
  }

  const needle = showSearch ? q.trim().toLowerCase() : "";
  const shown = needle
    ? items.filter((item) => {
        const hay = `${item.title}\n${item.originalTitle ?? ""}`.toLowerCase();
        return hay.includes(needle);
      })
    : items;

  return (
    <>
      <MediaToolbar
        type={type}
        query={query}
        genres={genres}
        count={shown.length}
        q={q}
        onQ={showSearch ? update : undefined}
      />
      {items.length === 0 ? (
        empty
      ) : shown.length === 0 ? (
        <p className="empty">没有匹配的条目。</p>
      ) : (
        <ItemGrid type={type} items={shown} />
      )}
    </>
  );
}
