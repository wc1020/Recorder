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

const GENRE_SHOW_MAX = 3;

/** TMDB 电视剧复合类型 zh-CN 经常不译，按常用中文补上。 */
const GENRE_ZH: Record<string, string> = {
  "Sci-Fi & Fantasy": "科幻",
  "Action & Adventure": "动作冒险",
  "War & Politics": "战争",
  Soap: "肥皂剧",
  Talk: "脱口秀",
  News: "新闻",
  Reality: "真人秀",
  Kids: "儿童",
};

export function localizeGenre(name: string): string {
  return GENRE_ZH[name] ?? name;
}

/** 类型最多三个；再多加 / ...，full 给悬停看完整的。 */
export function formatGenres(values: string[] | undefined): { text: string; full: string } {
  const list = (values ?? [])
    .map((g) => localizeGenre(g.trim()))
    .filter(Boolean);
  const full = list.join(" / ");
  if (list.length <= GENRE_SHOW_MAX) return { text: full, full };
  return { text: `${list.slice(0, GENRE_SHOW_MAX).join(" / ")} / ...`, full };
}

export function itemGenres(type: MediaType, extra: MediaExtra): string[] {
  const raw = type === "book" ? extra.categories : extra.genres;
  return (raw ?? [])
    .map((g) => (type === "book" ? g.trim() : localizeGenre(g.trim())))
    .filter(Boolean);
}

export function cardSubtitle(
  type: MediaType,
  year: number | null,
  extra: MediaExtra,
): { text: string; title?: string } {
  if (type === "book") {
    return {
      text: [joinNames(extra.authors, "、") || null, extra.publisher, year]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const genres = formatGenres(extra.genres);
  const person = type === "tv" ? extra.creators?.[0] : extra.directors?.[0];
  return {
    text: [year, genres.text || null, person ?? null].filter(Boolean).join(" · "),
    title: genres.full !== genres.text ? genres.full : undefined,
  };
}

const EMPTY = "—";

/** TMDB production_countries 常是英文国名；列表卡上改成常用中文。对不上就原样。 */
const COUNTRY_ZH: Record<string, string> = {
  "United States of America": "美国",
  US: "美国",
  China: "中国大陆",
  CN: "中国大陆",
  "Hong Kong": "中国香港",
  HK: "中国香港",
  Taiwan: "中国台湾",
  TW: "中国台湾",
  Japan: "日本",
  JP: "日本",
  "South Korea": "韩国",
  KR: "韩国",
  "United Kingdom": "英国",
  GB: "英国",
  France: "法国",
  FR: "法国",
  Germany: "德国",
  DE: "德国",
  Italy: "意大利",
  IT: "意大利",
  Spain: "西班牙",
  ES: "西班牙",
  Canada: "加拿大",
  CA: "加拿大",
  Australia: "澳大利亚",
  AU: "澳大利亚",
  India: "印度",
  IN: "印度",
  Russia: "俄罗斯",
  RU: "俄罗斯",
  Thailand: "泰国",
  TH: "泰国",
  Sweden: "瑞典",
  SE: "瑞典",
  Denmark: "丹麦",
  DK: "丹麦",
  Switzerland: "瑞士",
  CH: "瑞士",
  Netherlands: "荷兰",
  NL: "荷兰",
  Belgium: "比利时",
  BE: "比利时",
  Ireland: "爱尔兰",
  IE: "爱尔兰",
  "New Zealand": "新西兰",
  NZ: "新西兰",
  Mexico: "墨西哥",
  MX: "墨西哥",
  Brazil: "巴西",
  BR: "巴西",
  Poland: "波兰",
  PL: "波兰",
  "Czech Republic": "捷克",
  CZ: "捷克",
  Singapore: "新加坡",
  SG: "新加坡",
};

function regionLabel(countries: string[] | undefined): string {
  return joinNames((countries ?? []).map((c) => COUNTRY_ZH[c] ?? c));
}

/** 电影 / 电视剧列表卡：上映 / 地区 / 类型 / 导演。缺的显示 —。 */
export function movieCardFacts(
  type: "movie" | "tv",
  year: number | null,
  extra: MediaExtra,
): { k: string; v: string; title?: string }[] {
  const date =
    (type === "tv" ? extra.firstAirDate : extra.releaseDate) ||
    (year != null ? String(year) : EMPTY);
  const person = type === "tv" ? extra.creators : extra.directors;
  const genres = formatGenres(extra.genres);
  return [
    { k: "上映", v: date },
    { k: "地区", v: regionLabel(extra.countries) || EMPTY },
    {
      k: "类型",
      v: genres.text || EMPTY,
      title: genres.full || undefined,
    },
    { k: "导演", v: joinNames(person) || EMPTY },
  ];
}

export function factRows(
  type: MediaType,
  extra: MediaExtra,
): { k: string; v: string; title?: string }[] {
  const rows: { k: string; v: string; title?: string }[] = [];
  const add = (
    k: string,
    v: string | number | null | undefined,
    title?: string,
  ) => {
    if (v == null || v === "") return;
    rows.push({ k, v: String(v), title });
  };

  if (type === "book") {
    add("作者", joinNames(extra.authors, "、"));
    add("出版社", extra.publisher);
    add("出版", extra.publishedDate);
    add("页数", extra.pageCount);
    add("ISBN", extra.isbn);
    const cats = formatGenres(extra.categories);
    add("分类", cats.text, cats.full !== cats.text ? cats.full : undefined);
    return rows;
  }

  const genres = formatGenres(extra.genres);
  add("类型", genres.text, genres.full !== genres.text ? genres.full : undefined);
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
