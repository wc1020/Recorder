import Link from "next/link";
import { deleteCollection, createCollection } from "./actions";
import { MediaResults } from "./media-results";
import {
  collectionLabel,
  MANUAL_SOURCE,
  type MediaSort,
  type MediaType,
} from "@/lib/constants";
import { mediaPageHref, mediaSortOf, type MediaListQuery } from "@/lib/list-href";
import { latestEntryDate } from "@/lib/entry-dates";
import { itemGenres, parseExtra } from "@/lib/media-extra";
import { prisma } from "@/lib/db";

type SortItem = {
  year: number | null;
  entry: {
    rating: number | null;
    wishlistOn: string | null;
    startedOn: string | null;
    finishedOn: string | null;
  } | null;
};

function activityKey(item: SortItem): string {
  return latestEntryDate(item.entry) ?? "";
}

function sortItems<T extends SortItem>(items: T[], sort: MediaSort): T[] {
  const byActivity = (a: T, b: T) => activityKey(b).localeCompare(activityKey(a));
  if (sort === "rating") {
    return [...items].sort((a, b) => {
      const diff = (b.entry?.rating ?? -1) - (a.entry?.rating ?? -1);
      return diff !== 0 ? diff : byActivity(a, b);
    });
  }
  if (sort === "year") {
    return [...items].sort((a, b) => {
      const diff = (b.year ?? -1) - (a.year ?? -1);
      return diff !== 0 ? diff : byActivity(a, b);
    });
  }
  return [...items].sort(byActivity);
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

  const inbox = query.view === "inbox";
  const all = collection
    ? collection.items.map((row) => row.item)
    : await prisma.item.findMany({
        where: {
          type,
          source: inbox ? MANUAL_SOURCE : { not: MANUAL_SOURCE },
        },
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
      <MediaResults
        type={type}
        query={query}
        genres={genres}
        items={items.map((item) => ({
          id: item.id,
          title: item.title,
          originalTitle: item.originalTitle,
          year: item.year,
          coverUrl: item.coverUrl,
          extraJson: item.extraJson,
          entry: item.entry
            ? { status: item.entry.status, rating: item.entry.rating, review: item.entry.review }
            : null,
        }))}
        empty={
          <p className="empty">
            {collection
              ? `${listName}还是空的。在条目详情里加入。`
              : inbox
                ? "没有待整理的条目。搜不到、手动添加的会出现在这里。"
                : (
                  <>
                    还没有记录。去 <Link href={`/search?type=${type}`}>搜索</Link> 加入，或手动添加。
                  </>
                )}
          </p>
        }
      />
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
