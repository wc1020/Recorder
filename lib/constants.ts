export const MEDIA_TYPES = [
  { value: "movie", label: "电影" },
  { value: "book", label: "书" },
  { value: "game", label: "游戏" },
] as const;

export type MediaType = (typeof MEDIA_TYPES)[number]["value"];

export const STATUSES = [
  { value: "wishlist", labels: { movie: "想看", book: "想读", game: "想玩" } },
  { value: "in_progress", labels: { movie: "在看", book: "在读", game: "在玩" } },
  { value: "done", labels: { movie: "看过", book: "读过", game: "玩过" } },
  { value: "dropped", labels: { movie: "弃了", book: "弃了", game: "弃了" } },
] as const;

export type Status = (typeof STATUSES)[number]["value"];

export function isMediaType(value: string): value is MediaType {
  return MEDIA_TYPES.some((t) => t.value === value);
}

export function isStatus(value: string): value is Status {
  return STATUSES.some((s) => s.value === value);
}

export function typeLabel(type: string): string {
  return MEDIA_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function statusLabel(status: string, type: string): string {
  const row = STATUSES.find((s) => s.value === status);
  if (!row) return status;
  if (type === "movie" || type === "book" || type === "game") {
    return row.labels[type];
  }
  return row.labels.movie;
}

export function formatRating(rating: number | null | undefined): string {
  if (rating == null) return "";
  return `${rating / 2} 星`;
}
