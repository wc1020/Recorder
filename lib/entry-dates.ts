import { statusLabel } from "./constants";

export type EntryDateKey = "wishlistOn" | "startedOn" | "finishedOn";

export type EntryDates = Record<EntryDateKey, string | null>;

const DATE_KEYS: { key: EntryDateKey; status: string }[] = [
  { key: "wishlistOn", status: "wishlist" },
  { key: "startedOn", status: "in_progress" },
  { key: "finishedOn", status: "done" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (!DATE_RE.test(s)) return null;
  return s;
}

export function isDateInput(raw: string): boolean {
  const s = raw.trim();
  return s === "" || DATE_RE.test(s);
}

export function dateKeyForStatus(status: string): EntryDateKey | null {
  return DATE_KEYS.find((d) => d.status === status)?.key ?? null;
}

export function entryDateLabel(status: string, type: string): string {
  if (status === "done") {
    if (type === "book") return "读完的时间";
    if (type === "game") return "玩完的时间";
    return "看完的时间";
  }
  return `${statusLabel(status, type)}的时间`;
}

/** 电影默认没有「在看」时间；旧数据还停在「在看」时仍显示。 */
export function entryDateFields(type: string, status?: string) {
  return DATE_KEYS.filter((d) => {
    if (d.status !== "in_progress") return true;
    return type !== "movie" || status === "in_progress";
  }).map((d) => ({
    key: d.key,
    status: d.status,
    label: entryDateLabel(d.status, type),
  }));
}

export function applyStatusDate(
  type: string,
  prevStatus: string | null,
  nextStatus: string,
  dates: EntryDates,
): EntryDates {
  if (prevStatus === nextStatus) return dates;
  const key = dateKeyForStatus(nextStatus);
  if (!key) return dates;
  if (type === "movie" && key === "startedOn") return dates;
  if (dates[key]) return dates;
  return { ...dates, [key]: todayLocal() };
}

export function dateOrderError(
  type: string,
  dates: EntryDates,
  status?: string,
): string | null {
  const present = entryDateFields(type, status).filter((f) => dates[f.key]);
  for (let i = 1; i < present.length; i++) {
    const prev = present[i - 1];
    const cur = present[i];
    if (dates[cur.key]! < dates[prev.key]!) {
      return `${prev.label}须早于或等于${cur.label}`;
    }
  }
  return null;
}
