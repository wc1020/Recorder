import type { MediaType } from "@/lib/constants";

export type MediaExtra = {
  genres?: string[];
  directors?: string[];
  creators?: string[];
  cast?: string[];
  countries?: string[];
  languages?: string[];
  runtime?: number | null;
  seasons?: number | null;
  episodes?: number | null;
  releaseDate?: string | null;
  firstAirDate?: string | null;
  imdbId?: string | null;
  authors?: string[];
  isbn?: string | null;
  publisher?: string | null;
  publishedDate?: string | null;
  pageCount?: number | null;
  categories?: string[];
};

export function parseExtra(raw: string | null | undefined): MediaExtra {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return {};
    return value as MediaExtra;
  } catch {
    return {};
  }
}

export function extraJsonOf(extra: MediaExtra): string | null {
  return Object.values(extra).some((v) =>
    Array.isArray(v) ? v.length > 0 : v != null && v !== "",
  )
    ? JSON.stringify(extra)
    : null;
}

export function joinNames(values: string[] | undefined, sep = " / "): string {
  return (values ?? []).filter(Boolean).join(sep);
}

export function itemGenres(type: MediaType, extra: MediaExtra): string[] {
  const raw = type === "book" ? extra.categories : extra.genres;
  return (raw ?? []).map((g) => g.trim()).filter(Boolean);
}

export function cardSubtitle(
  type: MediaType,
  year: number | null,
  extra: MediaExtra,
): string {
  if (type === "book") {
    return [joinNames(extra.authors, "、") || null, extra.publisher, year]
      .filter(Boolean)
      .join(" · ");
  }
  const genres = (extra.genres ?? []).slice(0, 3).join(" / ");
  const person = type === "tv" ? extra.creators?.[0] : extra.directors?.[0];
  return [year, genres || null, person ?? null].filter(Boolean).join(" · ");
}

export function factRows(type: MediaType, extra: MediaExtra): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = [];
  const add = (k: string, v: string | number | null | undefined) => {
    if (v == null || v === "") return;
    rows.push({ k, v: String(v) });
  };

  if (type === "book") {
    add("作者", joinNames(extra.authors, "、"));
    add("出版社", extra.publisher);
    add("出版", extra.publishedDate);
    add("页数", extra.pageCount);
    add("ISBN", extra.isbn);
    add("分类", (extra.categories ?? []).slice(0, 4).join(" / "));
    return rows;
  }

  add("类型", (extra.genres ?? []).join(" / "));
  if (type === "tv") add("创作者", joinNames(extra.creators));
  else add("导演", joinNames(extra.directors));
  add("主演", (extra.cast ?? []).slice(0, 6).join(" / "));
  add("国家", joinNames(extra.countries));
  add("语言", joinNames(extra.languages));
  if (type === "tv") {
    const parts = [
      extra.seasons != null ? `${extra.seasons} 季` : null,
      extra.episodes != null ? `${extra.episodes} 集` : null,
    ].filter(Boolean);
    add("集数", parts.join(" · "));
    add("首播", extra.firstAirDate);
  } else {
    add("片长", extra.runtime != null ? `${extra.runtime} 分钟` : null);
    add("上映", extra.releaseDate);
  }
  return rows;
}

export function extraLinks(
  type: MediaType,
  source: string,
  sourceId: string,
  extra: MediaExtra,
): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  if (source === "tmdb") {
    const kind = type === "tv" ? "tv" : "movie";
    links.push({
      label: "TMDB",
      href: `https://www.themoviedb.org/${kind}/${encodeURIComponent(sourceId)}`,
    });
    if (extra.imdbId) {
      links.push({
        label: "IMDb",
        href: `https://www.imdb.com/title/${encodeURIComponent(extra.imdbId)}/`,
      });
    }
  }
  if (source === "google_books") {
    links.push({
      label: "Google Books",
      href: `https://books.google.com/books?id=${encodeURIComponent(sourceId)}`,
    });
  }
  if (source === "open_library") {
    const id = sourceId.replace(/^ol:/, "");
    links.push({
      label: "Open Library",
      href: `https://openlibrary.org/works/${encodeURIComponent(id)}`,
    });
  }
  return links;
}
