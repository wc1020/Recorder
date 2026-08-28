import Link from "next/link";
import { Cover } from "./cover";
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
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const rawType = sp.type ?? "";
  const type: MediaType = isMediaType(rawType) ? rawType : "movie";
  const status = isStatus(sp.status ?? "") ? sp.status : undefined;

  const items = await prisma.item.findMany({
    where: {
      type,
      ...(status ? { entry: { status } } : {}),
    },
    include: { entry: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <h1 className="sr-only">projectM</h1>
      <div className="tabs">
        {MEDIA_TYPES.map((t) => (
          <Link
            key={t.value}
            href={qs({ type: t.value, status })}
            className={t.value === type ? "tab active" : "tab"}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="filters">
        <Link href={qs({ type })} className={!status ? "filter active" : "filter"}>
          全部
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={qs({ type, status: s.value })}
            className={status === s.value ? "filter active" : "filter"}
          >
            {statusLabel(s.value, type)}
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

function qs(parts: { type: string; status?: string }): string {
  const p = new URLSearchParams({ type: parts.type });
  if (parts.status) p.set("status", parts.status);
  return `/?${p.toString()}`;
}
