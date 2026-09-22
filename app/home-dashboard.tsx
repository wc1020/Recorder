import Link from "next/link";
import { Cover } from "./cover";
import { FavoriteSlots, type FavoriteCandidate } from "./favorite-slots";
import { PosterWallButton, type PosterWallItem } from "./poster-wall-button";
import {
  FAVORITE_SLOTS,
  MEDIA_TYPES,
  isMediaType,
  type MediaType,
} from "@/lib/constants";
import { latestEntryDate } from "@/lib/entry-dates";
import { prisma } from "@/lib/db";
import { mediaPageHref } from "@/lib/list-href";
import { gamePageHref } from "@/lib/game-href";
import { loadSteamBackup } from "@/lib/steam-cache";

const RECENT_COUNT = 8;
const WALL_LIMIT = 48;

type HomeRow = {
  status: string;
  rating: number | null;
  favoriteRank: number | null;
  wishlistOn: string | null;
  startedOn: string | null;
  finishedOn: string | null;
  updatedAt: Date;
  item: {
    id: number;
    type: string;
    title: string;
    year: number | null;
    coverUrl: string | null;
    source: string;
    sourceId: string;
  };
};

type SteamRecentCard = {
  appid: number;
  name: string;
  coverUrl: string | null;
};

function asHomeRow(row: {
  status: string;
  rating: number | null;
  favoriteRank?: number | null;
  wishlistOn: string | null;
  startedOn: string | null;
  finishedOn: string | null;
  updatedAt: Date;
  item: HomeRow["item"];
}): HomeRow {
  return {
    status: row.status,
    rating: row.rating,
    favoriteRank: row.favoriteRank ?? null,
    wishlistOn: row.wishlistOn,
    startedOn: row.startedOn,
    finishedOn: row.finishedOn,
    updatedAt: row.updatedAt,
    item: row.item,
  };
}

function typeHref(type: MediaType): string {
  return type === "game" ? gamePageHref("recent") : mediaPageHref(type);
}

function steamAppid(item: HomeRow["item"]): number | undefined {
  if (item.type !== "game" || item.source !== "steam") return undefined;
  const n = Number(item.sourceId);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function sortKey(row: HomeRow): string {
  return latestEntryDate(row) ?? row.updatedAt.toISOString().slice(0, 10);
}

function coverUrls(row: HomeRow): string[] {
  const urls: string[] = [];
  const appid = steamAppid(row.item);
  if (appid != null) {
    const base = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
    urls.push(`${base}/${appid}/library_600x900_2x.jpg`);
    urls.push(`${base}/${appid}/library_600x900.jpg`);
    urls.push(`${base}/${appid}/header_schinese.jpg`);
    urls.push(`${base}/${appid}/header.jpg`);
  }
  if (row.item.coverUrl) urls.push(row.item.coverUrl);
  return [...new Set(urls.filter(Boolean))];
}

function byRatingThenDate(a: HomeRow, b: HomeRow): number {
  const rd = (b.rating ?? -1) - (a.rating ?? -1);
  if (rd !== 0) return rd;
  return sortKey(b).localeCompare(sortKey(a));
}

function byDate(a: HomeRow, b: HomeRow): number {
  const diff = sortKey(b).localeCompare(sortKey(a));
  if (diff !== 0) return diff;
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

function wallItems(rows: HomeRow[]): PosterWallItem[] {
  const preferred = rows.filter((r) => r.status === "done" && coverUrls(r).length);
  const pool = preferred.length >= 8 ? preferred : rows.filter((r) => coverUrls(r).length);
  return [...pool]
    .sort(byRatingThenDate)
    .slice(0, WALL_LIMIT)
    .map((r) => ({
      title: r.item.title,
      urls: coverUrls(r),
      rating: r.rating,
    }));
}

function toCandidate(row: HomeRow): FavoriteCandidate {
  const appid = steamAppid(row.item) ?? null;
  return {
    key: appid != null ? `steam:${appid}` : `item:${row.item.id}`,
    itemId: row.item.id,
    steamAppid: appid,
    title: row.item.title,
    year: row.item.year,
    coverUrl: row.item.coverUrl,
    favoriteRank: row.favoriteRank,
  };
}

function favoriteSlots(rows: HomeRow[]): (FavoriteCandidate | null)[] {
  const slots: (FavoriteCandidate | null)[] = Array.from({ length: FAVORITE_SLOTS }, () => null);
  for (const row of rows) {
    const rank = row.favoriteRank;
    if (rank == null || rank < 1 || rank > FAVORITE_SLOTS) continue;
    slots[rank - 1] = toCandidate(row);
  }
  return slots;
}

/** 游戏候选 = Steam 库存 ∪ 已有 Entry（想玩等）。 */
function gameCandidates(
  rows: HomeRow[],
  steam: Awaited<ReturnType<typeof loadSteamBackup>>,
): FavoriteCandidate[] {
  const map = new Map<string, FavoriteCandidate>();

  if (steam?.player) {
    const seen = new Set<number>();
    for (const g of [
      ...steam.player.owned,
      ...steam.player.family,
      ...steam.player.recentlyPlayed,
    ]) {
      if (seen.has(g.appid)) continue;
      seen.add(g.appid);
      map.set(`steam:${g.appid}`, {
        key: `steam:${g.appid}`,
        itemId: null,
        steamAppid: g.appid,
        title: g.name,
        year: null,
        coverUrl: g.coverUrl,
        favoriteRank: null,
      });
    }
  }

  for (const row of rows) {
    const c = toCandidate(row);
    const prev = map.get(c.key);
    map.set(c.key, {
      ...c,
      // 库存里的封面可能更新；有 Entry 的 rank 优先
      coverUrl: c.coverUrl ?? prev?.coverUrl ?? null,
      title: c.title || prev?.title || c.title,
    });
  }

  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "zh"));
}

function RecentEntryPosters({ rows }: { rows: HomeRow[] }) {
  if (!rows.length) {
    return <p className="home-block-empty muted">暂无记录。</p>;
  }
  return (
    <div className="home-posters is-recent">
      {rows.map((row) => (
        <Link
          key={row.item.id}
          href={`/item/${row.item.id}`}
          className="home-poster"
          title={row.item.title}
        >
          <Cover
            url={row.item.coverUrl}
            appid={steamAppid(row.item)}
            title={row.item.title}
            size="md"
            orientation={steamAppid(row.item) != null ? "portrait" : "landscape"}
          />
          <span className="home-poster-caption">{row.item.title}</span>
        </Link>
      ))}
    </div>
  );
}

function RecentSteamPosters({ games }: { games: SteamRecentCard[] }) {
  if (!games.length) {
    return <p className="home-block-empty muted">近两周没有游玩记录。去游戏页刷新后再看。</p>;
  }
  return (
    <div className="home-posters is-recent">
      {games.map((g) => (
        <Link key={g.appid} href={`/steam/${g.appid}`} className="home-poster" title={g.name}>
          <Cover appid={g.appid} url={g.coverUrl} title={g.name} size="md" orientation="portrait" />
          <span className="home-poster-caption">{g.name}</span>
        </Link>
      ))}
    </div>
  );
}

export async function HomeDashboard() {
  const [rows, steam] = await Promise.all([
    prisma.entry.findMany({
      include: {
        item: {
          select: {
            id: true,
            type: true,
            title: true,
            year: true,
            coverUrl: true,
            source: true,
            sourceId: true,
          },
        },
      },
    }),
    loadSteamBackup(),
  ]);

  const byType: Record<MediaType, HomeRow[]> = {
    movie: [],
    tv: [],
    book: [],
    game: [],
  };

  for (const row of rows) {
    if (!isMediaType(row.item.type)) continue;
    byType[row.item.type].push(asHomeRow(row));
  }

  const steamRecent: SteamRecentCard[] = (steam?.player.recentlyPlayed ?? [])
    .slice(0, RECENT_COUNT)
    .map((g) => ({
      appid: g.appid,
      name: g.name,
      coverUrl: g.coverUrl,
    }));

  return (
    <div className="home">
      <h1 className="sr-only">首页</h1>
      {MEDIA_TYPES.map((t) => {
        const all = byType[t.value];
        const recent = [...all].sort(byDate).slice(0, RECENT_COUNT);
        const walls = wallItems(all);
        const candidates =
          t.value === "game"
            ? gameCandidates(all, steam)
            : [...all]
                .sort((a, b) => a.item.title.localeCompare(b.item.title, "zh"))
                .map(toCandidate);

        return (
          <section key={t.value} className="home-module" aria-labelledby={`home-${t.value}`}>
            <div className="home-module-head">
              <Link href={typeHref(t.value)} className="home-module-title" id={`home-${t.value}`}>
                {t.label}
                <span className="home-module-count muted">{all.length}</span>
              </Link>
              <PosterWallButton typeLabel={t.label} items={walls} />
            </div>

            <div className="home-block">
              <h3 className="home-block-title">最喜欢</h3>
              <FavoriteSlots
                type={t.value}
                slots={favoriteSlots(all)}
                candidates={candidates}
              />
            </div>

            <div className="home-block">
              <h3 className="home-block-title">最近动态</h3>
              {t.value === "game" ? (
                <RecentSteamPosters games={steamRecent} />
              ) : (
                <RecentEntryPosters rows={recent} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
