import { extraJsonOf } from "@/lib/media-extra";
import { getOpenLibraryDetail, isOpenLibraryId, searchOpenLibrary } from "./open-library";
import type { ItemSnapshot, Provider, SearchHit } from "./types";
import { ProviderNotConfiguredError, requireEnv, yearFromDate } from "./types";

type VolumeInfo = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories?: string[];
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  industryIdentifiers?: { type: string; identifier: string }[];
};

type Volume = {
  id: string;
  volumeInfo?: VolumeInfo;
};

type BooksResponse = {
  items?: Volume[];
  error?: { message?: string };
};

function httpsImage(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:/, "https:");
}

function plainText(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

function isbnOf(info: VolumeInfo | undefined): string | null {
  const ids = info?.industryIdentifiers ?? [];
  return (
    ids.find((i) => i.type === "ISBN_13")?.identifier ??
    ids.find((i) => i.type === "ISBN_10")?.identifier ??
    null
  );
}

function authorsOf(info: VolumeInfo | undefined): string | null {
  const authors = info?.authors ?? [];
  return authors.length ? authors.join("、") : null;
}

function looksLikeIsbn(query: string): string | null {
  const compact = query.replace(/[-\s]/g, "");
  if (/^\d{9}[\dXx]$/i.test(compact) || /^97[89]\d{10}$/.test(compact)) {
    return compact;
  }
  return null;
}

function isbnFromSubtitle(subtitle: string | null): string | null {
  if (!subtitle) return null;
  const m = subtitle.match(/\b(97[89]\d{10}|\d{9}[\dXx])\b/i);
  return m?.[1] ?? null;
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[\s（）()·・.,，]/g, "");
}

function hitKey(hit: SearchHit): string {
  const isbn = isbnFromSubtitle(hit.subtitle);
  if (isbn) return `isbn:${isbn.toLowerCase()}`;
  return `t:${norm(hit.title)}`;
}

async function booksGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`https://www.googleapis.com/books/v1${path}`);
  url.searchParams.set("key", requireEnv("GOOGLE_BOOKS_API_KEY"));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => null)) as BooksResponse | null;
  if (!res.ok) {
    throw new Error(data?.error?.message || `Google Books 请求失败（${res.status}）`);
  }
  return data;
}

function toHits(items: Volume[] | undefined): SearchHit[] {
  return (items ?? []).map((item) => {
    const info = item.volumeInfo;
    const isbn = isbnOf(info);
    return {
      sourceId: item.id,
      title: info?.title || "未命名",
      year: yearFromDate(info?.publishedDate),
      coverUrl: httpsImage(info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail),
      subtitle: [authorsOf(info), isbn].filter(Boolean).join(" · ") || null,
    };
  });
}

async function searchGoogle(query: string): Promise<SearchHit[]> {
  const isbn = looksLikeIsbn(query);
  if (isbn) {
    const data = (await booksGet("/volumes", {
      q: `isbn:${isbn}`,
      maxResults: "20",
    })) as BooksResponse;
    return toHits(data.items);
  }

  let data = (await booksGet("/volumes", {
    q: query,
    maxResults: "20",
  })) as BooksResponse;
  if (!data.items?.length) {
    data = (await booksGet("/volumes", {
      q: `intitle:"${query.replaceAll('"', "")}"`,
      maxResults: "20",
    })) as BooksResponse;
  }
  return toHits(data.items);
}

function mergeHits(google: SearchHit[], open: SearchHit[]): SearchHit[] {
  const seen = new Set(google.map(hitKey));
  const byTitle = new Map(
    google.filter((h) => !h.coverUrl).map((h) => [norm(h.title), h] as const),
  );
  for (const hit of open) {
    if (!hit.coverUrl) continue;
    const g = byTitle.get(norm(hit.title));
    if (g && !g.coverUrl) g.coverUrl = hit.coverUrl;
  }
  const extra = open.filter((hit) => !seen.has(hitKey(hit)));
  return [...google, ...extra].slice(0, 30);
}

export const googleBooksProvider: Provider = {
  type: "book",
  source: "google_books",

  async search(query: string): Promise<SearchHit[]> {
    let google: SearchHit[] = [];
    let googleErr: unknown = null;
    try {
      google = await searchGoogle(query);
    } catch (err) {
      googleErr = err;
    }

    let open: SearchHit[] = [];
    try {
      open = await searchOpenLibrary(query);
    } catch {
      open = [];
    }

    if (!google.length && !open.length) {
      if (googleErr instanceof ProviderNotConfiguredError) throw googleErr;
      if (googleErr instanceof Error) throw googleErr;
      return [];
    }
    return mergeHits(google, open);
  },

  async getDetail(sourceId: string): Promise<ItemSnapshot> {
    if (isOpenLibraryId(sourceId)) {
      return getOpenLibraryDetail(sourceId);
    }
    const item = (await booksGet(`/volumes/${encodeURIComponent(sourceId)}`, {})) as Volume;
    const info = item.volumeInfo;
    return {
      type: "book",
      source: "google_books",
      sourceId: item.id,
      title: info?.title || "未命名",
      originalTitle: info?.subtitle || null,
      year: yearFromDate(info?.publishedDate),
      coverUrl: httpsImage(info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail),
      description: plainText(info?.description) || null,
      extraJson: extraJsonOf({
        authors: info?.authors ?? [],
        isbn: isbnOf(info),
        publisher: info?.publisher || null,
        publishedDate: info?.publishedDate || null,
        pageCount: info?.pageCount ?? null,
        categories: info?.categories ?? [],
      }),
    };
  },
};
