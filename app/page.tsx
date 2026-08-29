import Link from "next/link";
import { Cover } from "./cover";
import { SteamPanel } from "./steam-panel";
import {
  formatRating,
  isMediaType,
  isStatus,
  MEDIA_TYPES,
  STATUSES,
  statusLabel,
  type MediaType,
} from "@/lib/constants";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; view?: string; live?: string }>;
}) {
  const sp = await searchParams;
  const raw = sp.type ?? "";
  const type: MediaType | "game" =
    raw === "want" ? "game" : isMediaType(raw) ? raw : "movie";
  const gameView = raw === "want" ? "want" : sp.view;

  return (
    <>
      <h1 className="sr-only">projectM</h1>
      <div className="tabs">
        {MEDIA_TYPES.map((t) => (
          <Link
            key={t.value}
            href={`/?type=${t.value}`}
            className={t.value === type ? "tab active" : "tab"}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {type === "game" ? (
        <SteamPanel view={gameView} live={sp.live === "1"} />
      ) : null}
      {type === "movie" || type === "book" ? (
        <MediaList type={type} statusRaw={sp.status} />
      ) : null}
    </>
  );
}

async function MediaList({
  type,
  statusRaw,
}: {
  type: MediaType;
  statusRaw?: string;
}) {
  const status = isStatus(statusRaw ?? "") ? statusRaw : undefined;
  const all = await prisma.item.findMany({
    where: { type },
    include: { entry: true },
    orderBy: { createdAt: "desc" },
  });
  const items = status ? all.filter((item) => item.entry?.status === status) : all;
  const statusCount = (value: string) =>
    all.filter((item) => item.entry?.status === value).length;

  return (
    <>
      <div className="filters">
        <Link href={`/?type=${type}`} className={!status ? "filter active" : "filter"}>
          全部
          <span className="filter-count">{all.length}</span>
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={`/?type=${type}&status=${s.value}`}
            className={status === s.value ? "filter active" : "filter"}
          >
            {statusLabel(s.value, type)}
            <span className="filter-count">{statusCount(s.value)}</span>
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="empty">
          还没有记录。去 <Link href={`/search?type=${type}`}>搜索</Link> 加入。
        </p>
      ) : (
        <div className="grid">
          {items.map((item) => (
            <Link key={item.id} href={`/item/${item.id}`} className="card">
              <Cover url={item.coverUrl} title={item.title} />
              <div className="card-body">
                <p className="card-title">{item.title}</p>
                <p className="card-meta">
                  {item.entry ? statusLabel(item.entry.status, item.type) : ""}
                  {item.entry?.rating != null ? ` · ${formatRating(item.entry.rating)}` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
