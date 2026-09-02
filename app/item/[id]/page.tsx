import { notFound } from "next/navigation";
import {
  addItemToCollection,
  createCollection,
  removeItemFromCollection,
  saveEntry,
} from "../../actions";
import { Cover } from "../../cover";
import { ItemRefreshButton } from "../../item-refresh-button";
import { RememberType } from "../../remember-type";
import {
  collectionLabel,
  isMediaType,
  MANUAL_SOURCE,
  STATUSES,
  statusLabel,
  typeLabel,
} from "@/lib/constants";
import { extraLinks, factRows, parseExtra } from "@/lib/media-extra";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) notFound();

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      entry: true,
      collections: { include: { collection: true } },
    },
  });
  if (!item || !isMediaType(item.type)) notFound();

  const entry = item.entry;
  const extra = parseExtra(item.extraJson);
  const facts = factRows(item.type, extra);
  const links = extraLinks(item.type, item.source, item.sourceId, extra);
  const canRefresh = item.source !== MANUAL_SOURCE && item.type !== "game";
  const listName = collectionLabel(item.type);
  const inIds = new Set(item.collections.map((row) => row.collectionId));
  const lists =
    item.type === "movie" || item.type === "tv" || item.type === "book"
      ? await prisma.collection.findMany({
          where: { type: item.type },
          orderBy: { name: "asc" },
        })
      : [];
  const otherLists = lists.filter((c) => !inIds.has(c.id));

  return (
    <>
      <RememberType type={item.type} />
      <div className="detail">
      <Cover url={item.coverUrl} title={item.title} size="lg" />
      <div className="detail-info">
        <div className="detail-kicker">
          <p className="muted">
            {typeLabel(item.type)}
            {item.year ? ` · ${item.year}` : ""}
            {item.source === MANUAL_SOURCE ? " · 手动添加" : ""}
          </p>
          {canRefresh ? <ItemRefreshButton itemId={item.id} /> : null}
        </div>
        <h1>{item.title}</h1>
        {item.originalTitle ? <p className="muted">{item.originalTitle}</p> : null}

        {facts.length ? (
          <dl className="facts">
            {facts.map((row) => (
              <div key={row.k} className="facts-row">
                <dt>{row.k}</dt>
                <dd>{row.v}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {item.description ? <p className="detail-desc">{item.description}</p> : null}

        {links.length ? (
          <p className="detail-links">
            {links.map((link, i) => (
              <span key={link.href}>
                {i > 0 ? " · " : null}
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              </span>
            ))}
          </p>
        ) : null}

        {saved ? <p className="saved">已保存</p> : null}

        <form className="entry-form" action={saveEntry}>
          <input type="hidden" name="itemId" value={item.id} />
          <label>
            状态
            <select name="status" defaultValue={entry?.status ?? "wishlist"}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {statusLabel(s.value, item.type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            评分
            <select name="rating" defaultValue={entry?.rating?.toString() ?? ""}>
              <option value="">没打分</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n / 2} 星
                </option>
              ))}
            </select>
          </label>
          <label>
            短评
            <textarea name="review" rows={4} defaultValue={entry?.review ?? ""} />
          </label>
          <label>
            开始日期
            <input type="date" name="startedOn" defaultValue={entry?.startedOn ?? ""} />
          </label>
          <label>
            结束日期
            <input type="date" name="finishedOn" defaultValue={entry?.finishedOn ?? ""} />
          </label>
          <button className="btn" type="submit">
            保存
          </button>
        </form>

        {item.type === "movie" || item.type === "tv" || item.type === "book" ? (
          <section className="collection-box">
            <h2>{listName}</h2>
            {item.collections.length ? (
              <ul className="collection-on">
                {item.collections.map((row) => (
                  <li key={row.collectionId}>
                    <span>{row.collection.name}</span>
                    <form action={removeItemFromCollection}>
                      <input type="hidden" name="collectionId" value={row.collectionId} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <button className="btn btn-ghost btn-tiny" type="submit">
                        移出
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">还没加入任何{listName}。</p>
            )}
            {otherLists.length ? (
              <form action={addItemToCollection} className="collection-add">
                <input type="hidden" name="itemId" value={item.id} />
                <select name="collectionId" required>
                  {otherLists.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button className="btn" type="submit">
                  加入
                </button>
              </form>
            ) : null}
            <form action={createCollection} className="collection-add">
              <input type="hidden" name="type" value={item.type} />
              <input type="hidden" name="itemId" value={item.id} />
              <input name="name" required maxLength={40} placeholder={`新${listName}名称`} />
              <button className="btn" type="submit">
                新建并加入
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </div>
    </>
  );
}
