export const MEDIA_TYPES = [
  { value: "movie", label: "电影" },
  { value: "tv", label: "电视剧" },
  { value: "book", label: "图书" },
  { value: "game", label: "游戏" },
] as const;

export type MediaType = (typeof MEDIA_TYPES)[number]["value"];

export const STATUSES = [
  { value: "wishlist", labels: { movie: "想看", tv: "想看", book: "想读", game: "想玩" } },
  { value: "in_progress", labels: { movie: "在看", tv: "在看", book: "在读", game: "在玩" } },
  { value: "done", labels: { movie: "看过", tv: "看过", book: "读过", game: "玩过" } },
  { value: "dropped", labels: { movie: "弃了", tv: "弃了", book: "弃了", game: "弃了" } },
] as const;

export type Status = (typeof STATUSES)[number]["value"];

export function isMediaType(value: string): value is MediaType {
  return MEDIA_TYPES.some((t) => t.value === value);
}

export function isStatus(value: string): value is Status {
  return STATUSES.some((s) => s.value === value);
}

/** 电影没有「在看」；电视剧 / 图书 / 游戏仍是四个状态。 */
export function statusesFor(type: string) {
  if (type === "movie") {
    return STATUSES.filter((s) => s.value !== "in_progress");
  }
  return STATUSES;
}

export function isStatusFor(type: string, value: string): value is Status {
  return statusesFor(type).some((s) => s.value === value);
}

/** 详情下拉：按类型列出可选状态；旧数据不在列表里时仍带上当前值，方便改掉。 */
export function statusOptionsFor(type: string, current?: string | null) {
  const allowed = statusesFor(type);
  if (current && isStatus(current) && !isStatusFor(type, current)) {
    const extra = STATUSES.find((s) => s.value === current);
    return extra ? [...allowed, extra] : allowed;
  }
  return allowed;
}

export function typeLabel(type: string): string {
  return MEDIA_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function statusLabel(status: string, type: string): string {
  const row = STATUSES.find((s) => s.value === status);
  if (!row) return status;
  if (type === "movie" || type === "tv" || type === "book" || type === "game") {
    return row.labels[type];
  }
  return row.labels.movie;
}

export function formatRating(rating: number | null | undefined): string {
  if (rating == null) return "";
  return `${rating / 2} 星`;
}

export const MANUAL_SOURCE = "manual";

export const MEDIA_SORTS = [
  { value: "added", label: "加入时间" },
  { value: "rating", label: "评分" },
  { value: "year", label: "年份" },
] as const;

export type MediaSort = (typeof MEDIA_SORTS)[number]["value"];

export function isMediaSort(value: string): value is MediaSort {
  return MEDIA_SORTS.some((s) => s.value === value);
}

export function collectionLabel(type: string): string {
  return type === "book" ? "书单" : "片单";
}

/** 用户连续无操作这么久之后，才自动拉一次远程数据。 */
export const IDLE_REFRESH_MS = 15 * 60 * 1000;

/** 本地数据快照：间隔、最多留几份。 */
export const SNAPSHOT_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const SNAPSHOT_KEEP = 5;
