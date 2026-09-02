import { extraJsonOf } from "@/lib/media-extra";
import type { ItemSnapshot, SearchHit } from "./types";
import { yearFromDate } from "./types";

const UA = "ProjectM/0.0.1 (personal media library)";

type OlDoc = {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  publisher?: string[];
  number_of_pages_median?: number;
  subject?: string[];
};

type OlSearch = { docs?: OlDoc[] };

type OlWork = {
  title?: string;
  description?: string | { value?: string };
  subjects?: string[];
  covers?: number[];
};

export function isOpenLibraryId(sourceId: string): boolean {
  return sourceId.startsWith("ol:") || /^OL\d+[WMwm]$/.test(sourceId);
}

export function openLibraryWorkId(sourceId: string): string {
  return sourceId.replace(/^ol:/, "").replace(/^\/works\//, "");
}

function coverUrl(coverId: number | undefined): string | null {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;
}

function isbnOf(doc: OlDoc | undefined): string | null {
  const ids = doc?.isbn ?? [];
  return ids.find((i) => /^97[89]\d{10}$/.test(i)) ?? ids[0] ?? null;
}

function authorsOf(names: string[] | undefined): string | null {
  return names?.length ? names.join("、") : null;
}

function descOf(raw: OlWork["description"]): string | null {
  if (!raw) return null;
  const text = typeof raw === "string" ? raw : raw.value ?? "";
  const trimmed = text.trim();
  return trimmed || null;
}

async function olGet(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": UA },
    });
  } catch {
    throw new Error("连不上 Open Library，请检查网络");
  }
  if (!res.ok) throw new Error(`Open Library 请求失败（${res.status}）`);
  return res.json();
}

export async function searchOpenLibrary(query: string): Promise<SearchHit[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "20");
  url.searchParams.set(
    "fields",
    "key,title,subtitle,author_name,first_publish_year,cover_i,isbn,publisher",
  );
  const data = (await olGet(url.toString())) as OlSearch;
  return (data.docs ?? [])
    .filter((doc) => doc.key?.includes("/works/"))
    .map((doc) => {
      const workId = openLibraryWorkId(doc.key ?? "");
      const isbn = isbnOf(doc);
      return {
        sourceId: `ol:${workId}`,
        title: doc.title || "未命名",
        year: doc.first_publish_year ?? yearFromDate(undefined),
        coverUrl: coverUrl(doc.cover_i),
        subtitle: [authorsOf(doc.author_name), isbn].filter(Boolean).join(" · ") || null,
      };
    });
}

export async function getOpenLibraryDetail(sourceId: string): Promise<ItemSnapshot> {
  const workId = openLibraryWorkId(sourceId);
  const workUrl = `https://openlibrary.org/works/${encodeURIComponent(workId)}.json`;
  const searchUrl = new URL("https://openlibrary.org/search.json");
  searchUrl.searchParams.set("q", `key:/works/${workId}`);
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set(
    "fields",
    "key,title,subtitle,author_name,first_publish_year,cover_i,isbn,publisher,number_of_pages_median,subject",
  );

  const [work, search] = (await Promise.all([
    olGet(workUrl),
    olGet(searchUrl.toString()),
  ])) as [OlWork, OlSearch];

  const doc = search.docs?.[0];
  const title = work.title || doc?.title || "未命名";
  const cover = coverUrl(work.covers?.[0] ?? doc?.cover_i);
  return {
    type: "book",
    source: "open_library",
    sourceId: workId,
    title,
    originalTitle: doc?.subtitle || null,
    year: doc?.first_publish_year ?? null,
    coverUrl: cover,
    description: descOf(work.description),
    extraJson: extraJsonOf({
      authors: doc?.author_name ?? [],
      isbn: isbnOf(doc),
      publisher: doc?.publisher?.[0] || null,
      publishedDate: doc?.first_publish_year ? String(doc.first_publish_year) : null,
      pageCount: doc?.number_of_pages_median ?? null,
      categories: (work.subjects ?? doc?.subject ?? []).slice(0, 8),
    }),
  };
}
