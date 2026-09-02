import { extraJsonOf, formatGenres, localizeGenre } from "@/lib/media-extra";
import type { ItemSnapshot, Provider, SearchHit } from "./types";
import { requireEnv, yearFromDate } from "./types";

const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

type TmdbGenre = { id: number; name: string };
type TmdbCountry = { iso_3166_1: string; name: string };
type TmdbLanguage = { iso_639_1: string; name: string };
type TmdbCredits = {
  cast?: { name?: string }[];
  crew?: { name?: string; job?: string }[];
};

type TmdbMovie = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  genre_ids?: number[];
  genres?: TmdbGenre[];
  runtime?: number | null;
  production_countries?: TmdbCountry[];
  spoken_languages?: TmdbLanguage[];
  imdb_id?: string | null;
  credits?: TmdbCredits;
};

type TmdbTv = {
  id: number;
  name?: string;
  original_name?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  genre_ids?: number[];
  genres?: TmdbGenre[];
  created_by?: { name?: string }[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  origin_country?: string[];
  production_countries?: TmdbCountry[];
  spoken_languages?: TmdbLanguage[];
  episode_run_time?: number[];
  credits?: TmdbCredits;
};

type TmdbSearchResponse<T> = {
  results?: T[];
  status_message?: string;
};

const genreCache: { movie?: Map<number, string>; tv?: Map<number, string> } = {};

function posterUrl(path: string | null | undefined): string | null {
  return path ? `${IMAGE_BASE}${path}` : null;
}

function apiKey(): string {
  return requireEnv("TMDB_API_KEY");
}

function namesOf(rows: { name?: string }[] | undefined, max = 0): string[] {
  const names = (rows ?? []).map((r) => r.name?.trim() ?? "").filter(Boolean);
  return max > 0 ? names.slice(0, max) : names;
}

function countryNames(
  named?: TmdbCountry[],
  codes?: string[],
): string[] {
  const fromNamed = namesOf(named);
  if (fromNamed.length) return fromNamed;
  return (codes ?? []).filter(Boolean);
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

async function loadGenreMap(kind: "movie" | "tv"): Promise<Map<number, string>> {
  let map = genreCache[kind];
  if (!map) {
    const data = (await tmdbGet(`/genre/${kind}/list`, {})) as { genres?: TmdbGenre[] };
    map = new Map((data.genres ?? []).map((g) => [g.id, localizeGenre(g.name)]));
    genreCache[kind] = map;
  }
  return map;
}

function searchSubtitle(genres: string[], original: string | null): string | null {
  const parts = [formatGenres(genres).text || null, original].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export const tmdbProvider: Provider = {
  type: "movie",
  source: "tmdb",

  async search(query: string): Promise<SearchHit[]> {
    const data = (await tmdbGet("/search/movie", { query })) as TmdbSearchResponse<TmdbMovie>;
    const genresById = await loadGenreMap("movie");
    return (data.results ?? []).map((movie) => {
      const title = movie.title || movie.original_title || "未命名";
      const original =
        movie.original_title && movie.original_title !== title ? movie.original_title : null;
      const genres = (movie.genre_ids ?? [])
        .map((id) => genresById.get(id))
        .filter((name): name is string => Boolean(name));
      return {
        sourceId: String(movie.id),
        title,
        year: yearFromDate(movie.release_date),
        coverUrl: posterUrl(movie.poster_path),
        subtitle: searchSubtitle(genres, original),
      };
    });
  },

  async getDetail(sourceId: string): Promise<ItemSnapshot> {
    const movie = (await tmdbGet(`/movie/${encodeURIComponent(sourceId)}`, {
      append_to_response: "credits",
    })) as TmdbMovie;
    const title = movie.title || movie.original_title || "未命名";
    const originalTitle =
      movie.original_title && movie.original_title !== title ? movie.original_title : null;
    const directors = (movie.credits?.crew ?? [])
      .filter((c) => c.job === "Director")
      .map((c) => c.name?.trim() ?? "")
      .filter(Boolean);
    return {
      type: "movie",
      source: "tmdb",
      sourceId: String(movie.id),
      title,
      originalTitle,
      year: yearFromDate(movie.release_date),
      coverUrl: posterUrl(movie.poster_path),
      description: movie.overview || null,
      extraJson: extraJsonOf({
        genres: namesOf(movie.genres).map(localizeGenre),
        directors,
        cast: namesOf(movie.credits?.cast, 6),
        countries: countryNames(movie.production_countries),
        languages: namesOf(movie.spoken_languages),
        runtime: movie.runtime ?? null,
        releaseDate: movie.release_date || null,
        imdbId: movie.imdb_id || null,
      }),
    };
  },
};

export const tmdbTvProvider: Provider = {
  type: "tv",
  source: "tmdb",

  async search(query: string): Promise<SearchHit[]> {
    const data = (await tmdbGet("/search/tv", { query })) as TmdbSearchResponse<TmdbTv>;
    const genresById = await loadGenreMap("tv");
    return (data.results ?? []).map((show) => {
      const title = show.name || show.original_name || "未命名";
      const original =
        show.original_name && show.original_name !== title ? show.original_name : null;
      const genres = (show.genre_ids ?? [])
        .map((id) => genresById.get(id))
        .filter((name): name is string => Boolean(name));
      return {
        sourceId: String(show.id),
        title,
        year: yearFromDate(show.first_air_date),
        coverUrl: posterUrl(show.poster_path),
        subtitle: searchSubtitle(genres, original),
      };
    });
  },

  async getDetail(sourceId: string): Promise<ItemSnapshot> {
    const show = (await tmdbGet(`/tv/${encodeURIComponent(sourceId)}`, {
      append_to_response: "credits",
    })) as TmdbTv;
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
      extraJson: extraJsonOf({
        genres: namesOf(show.genres).map(localizeGenre),
        creators: namesOf(show.created_by),
        cast: namesOf(show.credits?.cast, 6),
        countries: countryNames(show.production_countries, show.origin_country),
        languages: namesOf(show.spoken_languages),
        runtime: show.episode_run_time?.[0] ?? null,
        seasons: show.number_of_seasons ?? null,
        episodes: show.number_of_episodes ?? null,
        firstAirDate: show.first_air_date || null,
      }),
    };
  },
};
