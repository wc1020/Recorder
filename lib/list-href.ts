import {
  isMediaSort,
  isMediaType,
  isStatus,
  isStatusFor,
  type MediaSort,
  type MediaType,
} from "./constants";
import { gamePageHref, parseGameView } from "./game-href";

export type MediaListQuery = {
  status?: string;
  sort?: string;
  genre?: string;
  list?: string;
  view?: string;
};

function storageKey(type: MediaType): string {
  return `pm-list:${type}`;
}

const LAST_TYPE_KEY = "pm-last-type";

function statusOk(status: string, type?: string): boolean {
  return type ? isStatusFor(type, status) : isStatus(status);
}

function encodeMediaState(q: MediaListQuery, type?: string): string {
  const sp = new URLSearchParams();
  if (q.view === "lists") sp.set("view", "lists");
  if (q.list) sp.set("list", q.list);
  if (q.status && statusOk(q.status, type) && q.view !== "lists" && !q.list) {
    sp.set("status", q.status);
  }
  if (q.sort && isMediaSort(q.sort) && q.sort !== "added") sp.set("sort", q.sort);
  if (q.genre) sp.set("genre", q.genre);
  return sp.toString();
}

export function parseMediaListQuery(
  sp: {
    status?: string | null;
    sort?: string | null;
    genre?: string | null;
    list?: string | null;
    view?: string | null;
  },
  type?: string,
): MediaListQuery {
  const view = sp.view === "lists" ? "lists" : undefined;
  const list = sp.list?.trim() || undefined;
  return {
    view: list ? undefined : view,
    list,
    status: statusOk(sp.status ?? "", type) ? sp.status! : undefined,
    sort: isMediaSort(sp.sort ?? "") ? sp.sort! : undefined,
    genre: (() => {
      const g = sp.genre?.trim();
      return g && g !== "all" ? g : undefined;
    })(),
  };
}

function parseSaved(raw: string | null, type?: string): MediaListQuery {
  if (!raw) return {};
  if (statusOk(raw, type)) return { status: raw };
  return parseMediaListQuery(Object.fromEntries(new URLSearchParams(raw)), type);
}

export function rememberHomeList(sp: {
  type?: string | null;
  status?: string | null;
  view?: string | null;
  sort?: string | null;
  genre?: string | null;
  list?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const raw = sp.type ?? "";
  const type: MediaType | null = raw === "want" ? "game" : isMediaType(raw) ? raw : null;
  if (!type) return;
  sessionStorage.setItem(LAST_TYPE_KEY, type);
  if (type === "game") {
    const view = raw === "want" ? "want" : parseGameView(sp.view ?? undefined);
    sessionStorage.setItem(storageKey("game"), view);
    return;
  }
  sessionStorage.setItem(
    storageKey(type),
    encodeMediaState(parseMediaListQuery(sp, type), type),
  );
}

export function rememberMediaType(type: string): void {
  if (typeof window === "undefined" || !isMediaType(type)) return;
  sessionStorage.setItem(LAST_TYPE_KEY, type);
}

export function lastMediaType(): MediaType | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(LAST_TYPE_KEY);
  return raw && isMediaType(raw) ? raw : null;
}

export function mediaPageHref(type: MediaType, q: MediaListQuery = {}): string {
  const qs = encodeMediaState(q, type);
  return qs ? `/?type=${type}&${qs}` : `/?type=${type}`;
}

export function mediaSortOf(q: MediaListQuery): MediaSort {
  return q.sort && isMediaSort(q.sort) ? q.sort : "added";
}

export function typeListHref(type: MediaType): string {
  if (typeof window === "undefined") return `/?type=${type}`;
  const saved = sessionStorage.getItem(storageKey(type));
  if (type === "game") return gamePageHref(parseGameView(saved ?? undefined));
  return mediaPageHref(type, parseSaved(saved, type));
}
