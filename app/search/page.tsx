import Link from "next/link";
import { AddButton } from "../add-button";
import { Cover } from "../cover";
import { isMediaType, MEDIA_TYPES, type MediaType } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getProvider, ProviderNotConfiguredError } from "@/lib/providers";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const rawType = sp.type ?? "";
  const type: MediaType = isMediaType(rawType) ? rawType : "movie";
  const q = (sp.q ?? "").trim();

  let hits: Awaited<ReturnType<ReturnType<typeof getProvider>["search"]>> = [];
  let error: string | null = null;
  if (q) {
    try {
      hits = await getProvider(type).search(q);
    } catch (err) {
      error =
        err instanceof ProviderNotConfiguredError
          ? err.message
          : err instanceof Error
            ? err.message
            : "搜索失败";
    }
  }

  const source = getProvider(type).source;
  const existing =
    hits.length === 0
      ? []
      : await prisma.item.findMany({
          where: {
            type,
            source,
            sourceId: { in: hits.map((h) => h.sourceId) },
          },
          select: { id: true, sourceId: true },
        });
  const existingMap = new Map(existing.map((i) => [i.sourceId, i.id]));

  return (
    <>
      <h1>搜索</h1>
      <form className="search-form" action="/search" method="get">
        <select name="type" defaultValue={type}>
          {MEDIA_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="片名 / 剧名 / 书名 / 游戏名"
          required
        />
        <button className="btn" type="submit">
          搜索
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {!q ? <p className="muted">输入关键词，从正规资料库搜索后加入。</p> : null}
      {q && !error && hits.length === 0 ? <p className="empty">没有结果。</p> : null}
      {hits.map((hit) => {
        const localId = existingMap.get(hit.sourceId);
        return (
          <div key={hit.sourceId} className="search-row">
            <Cover url={hit.coverUrl} title={hit.title} size="sm" />
            <div className="search-row-body">
              <h2>{hit.title}</h2>
              <p className="muted">
                {[hit.year, hit.subtitle].filter(Boolean).join(" · ")}
              </p>
              {localId ? (
                <Link className="ok" href={`/item/${localId}`}>
                  已入库
                </Link>
              ) : (
                <AddButton type={type} sourceId={hit.sourceId} />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
