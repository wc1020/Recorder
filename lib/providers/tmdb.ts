import type { ItemSnapshot, Provider, SearchHit } from "./types";
import { requireEnv, yearFromDate } from "./types";

const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

type TmdbMovie = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
};

type TmdbTv = {
  id: number;
  name?: string;
  original_name?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
};

type TmdbSearchResponse<T> = {
  results?: T[];
  status_message?: string;
};

function posterUrl(path: string | null | undefined): string | null {
  return path ? `${IMAGE_BASE}${path}` : null;
}

function apiKey(): string {
  return requireEnv("TMDB_API_KEY");
}

async function tmdbGet(path: string, params: Record<string, string>): Promise<unknown> {
  // api.themoviedb.org 在国内常被污染/超时；api.tmdb.org 是同一套官方 API
  const url = new URL(`https://api.tmdb.org/3${path}`);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("language", "zh-CN");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error("连不上 TMDB，请检查网络");
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "status_message" in data
        ? String((data as TmdbSearchResponse<unknown>).status_message)
        : `TMDB 请求失败（${res.status}）`;
    throw new Error(message);
  }
  return data;
}

export const tmdbProvider: Provider = {
  type: "movie",
  source: "tmdb",

  async search(query: string): Promise<SearchHit[]> {
    const data = (await tmdbGet("/search/movie", { query })) as TmdbSearchResponse<TmdbMovie>;
    return (data.results ?? []).map((movie) => ({
      sourceId: String(movie.id),
      title: movie.title || movie.original_title || "未命名",
      year: yearFromDate(movie.release_date),
      coverUrl: posterUrl(movie.poster_path),
      subtitle:
        movie.original_title && movie.original_title !== movie.title
          ? movie.original_title
          : null,
    }));
  },

  async getDetail(sourceId: string): Promise<ItemSnapshot> {
    const movie = (await tmdbGet(`/movie/${encodeURIComponent(sourceId)}`, {})) as TmdbMovie;
    const title = movie.title || movie.original_title || "未命名";
    const originalTitle =
      movie.original_title && movie.original_title !== title ? movie.original_title : null;
    return {
      type: "movie",
      source: "tmdb",
      sourceId: String(movie.id),
      title,
      originalTitle,
      year: yearFromDate(movie.release_date),
      coverUrl: posterUrl(movie.poster_path),
      description: movie.overview || null,
      extraJson: null,
    };
  },
};

export const tmdbTvProvider: Provider = {
  type: "tv",
  source: "tmdb",

  async search(query: string): Promise<SearchHit[]> {
    const data = (await tmdbGet("/search/tv", { query })) as TmdbSearchResponse<TmdbTv>;
    return (data.results ?? []).map((show) => ({
      sourceId: String(show.id),
      title: show.name || show.original_name || "未命名",
      year: yearFromDate(show.first_air_date),
      coverUrl: posterUrl(show.poster_path),
      subtitle:
        show.original_name && show.original_name !== show.name ? show.original_name : null,
    }));
  },

  async getDetail(sourceId: string): Promise<ItemSnapshot> {
    const show = (await tmdbGet(`/tv/${encodeURIComponent(sourceId)}`, {})) as TmdbTv;
    const title = show.name || show.original_name || "未命名";
    const originalTitle =
      show.original_name && show.original_name !== title ? show.original_name : null;
    return {
      type: "tv",
      source: "tmdb",
      sourceId: String(show.id),
      title,
      originalTitle,
      year: yearFromDate(show.first_air_date),
      coverUrl: posterUrl(show.poster_path),
      description: show.overview || null,
      extraJson: null,
    };
  },
};
