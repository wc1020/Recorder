import Link from "next/link";
import { Cover } from "./cover";
import { SteamPanel } from "./steam-panel";
import {
  formatRating,
  isMediaType,
  isStatus,
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
  const type: MediaType | null =
    raw === "want" ? "game" : isMediaType(raw) ? raw : null;
  const gameView = raw === "want" ? "want" : sp.view;

  if (!type) {
    return (
      <>
        <h1>首页</h1>
        <p className="muted">内容还没定。</p>
      </>
    );
  }

  return (
    <>
      <h1 className="sr-only">ProjectM</h1>
      {type === "game" ? (
        <SteamPanel view={gameView} live={sp.live === "1"} />
      ) : null}
      {type === "movie" || type === "tv" || type === "book" ? (
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

  return (
    <>
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
                <p className="card-title" title={item.title}>
                  <span>{item.title}</span>
                </p>
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
