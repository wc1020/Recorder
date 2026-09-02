import Link from "next/link";
import { Cover } from "./cover";
import { deleteCollection, createCollection } from "./actions";
import { MediaToolbar } from "./media-toolbar";
import {
  collectionLabel,
  formatRating,
  statusLabel,
  type MediaSort,
  type MediaType,
} from "@/lib/constants";
import { mediaPageHref, mediaSortOf, type MediaListQuery } from "@/lib/list-href";
import { cardSubtitle, itemGenres, movieCardFacts, parseExtra } from "@/lib/media-extra";
import { prisma } from "@/lib/db";

function sortItems<T extends { createdAt: Date; year: number | null; entry: { rating: number | null } | null }>(
  items: T[],
  sort: MediaSort,
): T[] {
  if (sort === "rating") {
    return [...items].sort((a, b) => {
      const diff = (b.entry?.rating ?? -1) - (a.entry?.rating ?? -1);
      return diff !== 0 ? diff : b.createdAt.getTime() - a.createdAt.getTime();
    });
  }
  if (sort === "year") {
    return [...items].sort((a, b) => {
      const diff = (b.year ?? -1) - (a.year ?? -1);
      return diff !== 0 ? diff : b.createdAt.getTime() - a.createdAt.getTime();
    });
  }
  return items;
}

function ItemGrid({
  type,
  items,
}: {
  type: MediaType;
  items: {
    id: number;
    title: string;
    year: number | null;
    coverUrl: string | null;
    extraJson: string | null;
    entry: { status: string; rating: number | null; review: string | null } | null;
  }[];
}) {
  return (
    <div className="grid">
      {items.map((item) => {
        const extra = parseExtra(item.extraJson);
        const sub = cardSubtitle(type, item.year, extra);
        const statusText = item.entry
          ? [
              statusLabel(item.entry.status, type),
              item.entry.rating != null ? formatRating(item.entry.rating) : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : "—";
        return (
          <Link key={item.id} href={`/item/${item.id}`} className="card">
            <Cover url={item.coverUrl} title={item.title} />
            <div className="card-body">
              <p className="card-title" title={item.title}>
                <span>{item.title}</span>
              </p>
              {type === "movie" || type === "tv" ? (
                <dl className="card-stats">
                  {movieCardFacts(type, item.year, extra).map((row) => (
                    <div key={row.k} className="card-stat">
                      <dt>{row.k}</dt>
                      <dd title={row.title ?? (row.v !== "—" ? row.v : undefined)}>{row.v}</dd>
                    </div>
                  ))}
                  <div className="card-stat">
                    <dt>状态</dt>
                    <dd title={statusText !== "—" ? statusText : undefined}>{statusText}</dd>
                  </div>
                </dl>
              ) : (
                <>
                  {sub.text ? (
                    <p className="card-sub" title={sub.title}>
                      {sub.text}
                    </p>
                  ) : null}
                  <p className="card-meta">
                    {item.entry ? statusLabel(item.entry.status, type) : ""}
                    {item.entry?.rating != null ? ` · ${formatRating(item.entry.rating)}` : ""}
                  </p>
                  {item.entry?.review ? (
                    <p className="card-review" title={item.entry.review}>
                      {item.entry.review}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export async function MediaList({ type, query }: { type: MediaType; query: MediaListQuery }) {
  const listName = collectionLabel(type);
  if (query.view === "lists") {
    return <CollectionIndex type={type} query={query} />;
  }

  const listId = query.list ? Number(query.list) : NaN;
  const collection =
    Number.isInteger(listId) && listId > 0
      ? await prisma.collection.findFirst({
          where: { id: listId, type },
          include: {
            items: {
              include: { item: { include: { entry: true } } },
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : null;

  if (query.list && !collection) {
    return <p className="empty">没有这个{listName}。</p>;
  }

  const all = collection
    ? collection.items.map((row) => row.item)
    : await prisma.item.findMany({
        where: { type },
        include: { entry: true },
        orderBy: { createdAt: "desc" },
      });

  const genres = [
    ...new Set(all.flatMap((item) => itemGenres(type, parseExtra(item.extraJson)))),
  ].sort((a, b) => a.localeCompare(b, "zh"));

  let items = all;
  if (!collection && query.status) {
    items = items.filter((item) => item.entry?.status === query.status);
  }
  if (query.genre) {
    items = items.filter((item) =>
      itemGenres(type, parseExtra(item.extraJson)).includes(query.genre!),
    );
  }
  items = sortItems(items, mediaSortOf(query));

  return (
    <>
      {collection ? (
        <div className="collection-head">
          <h2>{collection.name}</h2>
          <form action={deleteCollection}>
            <input type="hidden" name="collectionId" value={collection.id} />
            <button className="btn btn-ghost btn-tiny" type="submit">
              删除{listName}
            </button>
          </form>
        </div>
      ) : null}
      <MediaToolbar type={type} query={query} genres={genres} />
      {items.length === 0 ? (
        <p className="empty">
          {collection
            ? `${listName}还是空的。在条目详情里加入。`
            : (
              <>
                还没有记录。去 <Link href={`/search?type=${type}`}>搜索</Link> 加入，或手动添加。
              </>
            )}
        </p>
      ) : (
        <ItemGrid type={type} items={items} />
      )}
    </>
  );
}

async function CollectionIndex({ type, query }: { type: MediaType; query: MediaListQuery }) {
  const listName = collectionLabel(type);
  const collections = await prisma.collection.findMany({
    where: { type },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <form action={createCollection} className="collection-new">
        <input type="hidden" name="type" value={type} />
        <input name="name" required maxLength={40} placeholder={`新${listName}名称`} />
        <button className="btn" type="submit">
          新建
        </button>
      </form>
      {collections.length === 0 ? (
        <p className="empty">还没有{listName}。上面建一个，或在条目详情里加入。</p>
      ) : (
        <ul className="collection-list">
          {collections.map((col) => (
            <li key={col.id}>
              <Link href={mediaPageHref(type, { ...query, view: undefined, list: String(col.id) })}>
                {col.name}
                <span className="muted"> {col._count.items}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
