import { isMediaType, isStatus, type MediaType } from "./constants";
import { gamePageHref, parseGameView } from "./game-href";

function storageKey(type: MediaType): string {
  return `pm-list:${type}`;
}

export function rememberHomeList(sp: {
  type?: string | null;
  status?: string | null;
  view?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const raw = sp.type ?? "";
  const type: MediaType | null = raw === "want" ? "game" : isMediaType(raw) ? raw : null;
  if (!type) return;
  if (type === "game") {
    const view = raw === "want" ? "want" : parseGameView(sp.view ?? undefined);
    sessionStorage.setItem(storageKey("game"), view);
    return;
  }
  const status = isStatus(sp.status ?? "") ? sp.status! : "";
  sessionStorage.setItem(storageKey(type), status);
}

export function typeListHref(type: MediaType): string {
  if (typeof window === "undefined") return `/?type=${type}`;
  const saved = sessionStorage.getItem(storageKey(type));
  if (type === "game") return gamePageHref(parseGameView(saved ?? undefined));
  if (saved && isStatus(saved)) return `/?type=${type}&status=${saved}`;
  return `/?type=${type}`;
}
