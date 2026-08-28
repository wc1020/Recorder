import type { ItemSnapshot, Provider, SearchHit } from "./types";
import { requireEnv, yearFromDate } from "./types";

type VolumeInfo = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publishedDate?: string;
  description?: string;
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

function searchQuery(query: string): string {
  const isbn = looksLikeIsbn(query);
  if (isbn) return `isbn:${isbn}`;
  return `intitle:"${query.replaceAll('"', "")}"`;
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

export const googleBooksProvider: Provider = {
  type: "book",
  source: "google_books",

  async search(query: string): Promise<SearchHit[]> {
    let data = (await booksGet("/volumes", {
      q: searchQuery(query),
      maxResults: "20",
    })) as BooksResponse;
    if (!data.items?.length && !looksLikeIsbn(query)) {
      data = (await booksGet("/volumes", {
        q: query,
        maxResults: "20",
      })) as BooksResponse;
    }
    return (data.items ?? []).map((item) => {
      const info = item.volumeInfo;
      return {
        sourceId: item.id,
        title: info?.title || "未命名",
        year: yearFromDate(info?.publishedDate),
        coverUrl: httpsImage(info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail),
        subtitle: authorsOf(info),
      };
    });
  },

  async getDetail(sourceId: string): Promise<ItemSnapshot> {
    const item = (await booksGet(`/volumes/${encodeURIComponent(sourceId)}`, {})) as Volume;
    const info = item.volumeInfo;
    const extra = {
      authors: info?.authors ?? [],
      isbn: isbnOf(info),
    };
    return {
      type: "book",
      source: "google_books",
      sourceId: item.id,
      title: info?.title || "未命名",
      originalTitle: info?.subtitle || null,
      year: yearFromDate(info?.publishedDate),
      coverUrl: httpsImage(info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail),
      description: info?.description || null,
      extraJson: JSON.stringify(extra),
    };
  },
};
