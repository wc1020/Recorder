import Link from "next/link";
import { Cover } from "./cover";
import { RefreshButton } from "./refresh-button";
import { SteamLiveGate } from "./steam-live-gate";
import { gamePageHref } from "@/lib/game-href";
import {
  cachedPerfectCount,
  filterPerfectGames,
  getSteamPlayerPage,
  mergeLibraryGames,
  mergePlayedGames,
  type SteamGameRow,
} from "@/lib/providers/steam";
import { formatBackupTime, formatFenLabel, formatHours, formatYuan } from "@/lib/steam-format";
import { ProviderNotConfiguredError } from "@/lib/providers";
import { formatRating, statusLabel } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { listPaidFen } from "@/lib/steam-paid";

export const GAME_VIEWS = [
  { value: "recent", label: "最近游玩" },
  { value: "played", label: "全部游玩" },
  { value: "perfect", label: "完美通关" },
  { value: "owned", label: "库存游戏" },
  { value: "family", label: "家庭库" },
  { value: "want", label: "想玩" },
] as const;

export type GameView = (typeof GAME_VIEWS)[number]["value"];

export function parseGameView(value: string | undefined): GameView {
  return GAME_VIEWS.some((v) => v.value === value) ? (value as GameView) : "recent";
}

export async function SteamPanel({
  view,
  live = false,
}: {
  view?: string;
  live?: boolean;
}) {
  const current = parseGameView(view);
  try {
    const data = await getSteamPlayerPage({ live });
    const played = mergePlayedGames(data.owned, [
      ...data.recentlyPlayed,
      ...data.family,
    ]);
    const library = mergeLibraryGames(
      data.owned,
      data.recentlyPlayed,
      data.family,
    );
    const paidByApp = await listPaidFen(library.map((g) => g.appid));
    const hideAppIds = [
      ...data.owned.map((g) => g.appid),
      ...data.family.map((g) => g.appid),
    ];
    const wantItems = await loadWantItems(hideAppIds);
    const perfect =
      current === "perfect"
        ? await filterPerfectGames(library, { fromCache: data.fromCache })
        : [];
    const counts: Record<GameView, number | null> = {
      recent: data.recentlyPlayed.length,
      played: played.length,
      perfect: current === "perfect" ? perfect.length : cachedPerfectCount(library),
      owned: data.owned.length,
      family: data.family.length,
      want: wantItems.length,
    };

    return (
      <>
        <SteamLiveGate />
        <section className="steam-profile">
          <div className="steam-profile-main">
            {data.profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="steam-avatar"
                src={data.profile.avatarUrl}
                alt=""
              />
            ) : (
              <div className="steam-avatar cover-empty" />
            )}
            <div>
              <h2 className="steam-name">{data.profile.name}</h2>
              <p className="steam-stats">
                总时长 {formatHours(data.totalPlaytimeMin)} · 库存 {data.owned.length} 款
                {data.family.length > 0
                  ? ` · 家庭库 ${data.family.length} 款 ${formatHours(data.familyPlaytimeMin)}`
                  : data.familyRecentPlaytimeMin > 0
                    ? ` · 含家庭库近两周 ${formatHours(data.familyRecentPlaytimeMin)}`
                    : ""}
              </p>
              {data.familyError ? <p className="muted">{data.familyError}</p> : null}
              {(data.privateAppIds?.length ?? 0) > 0 ? (
                <p className="muted">
                  已排除 {data.privateAppIds.length} 款 Steam 私人游戏
                </p>
              ) : null}
              {data.cacheReason === "offline" ? (
                <p className="muted">
                  当前是本地备份
                  {data.cachedAt ? `（${formatBackupTime(data.cachedAt)}）` : ""}
                  。连上 Steam 后点刷新会覆盖这份备份。
                </p>
              ) : null}
              <a href={data.profile.profileUrl} target="_blank" rel="noreferrer">
                公开资料
              </a>
            </div>
          </div>
          <RefreshButton view={current} />
        </section>

        <div className="filters">
          {GAME_VIEWS.map((v) => (
            <Link
              key={v.value}
              href={gamePageHref(v.value)}
              className={current === v.value ? "filter active" : "filter"}
            >
              {v.label}
              {counts[v.value] != null ? (
                <span className="filter-count">{counts[v.value]}</span>
              ) : null}
            </Link>
          ))}
        </div>

        {current === "recent" ? (
          <SteamList
            games={data.recentlyPlayed}
            paidByApp={paidByApp}
            empty="近两周没有记录。资料里的游戏详情需要公开。"
          />
        ) : null}
        {current === "played" ? (
          <SteamList games={played} paidByApp={paidByApp} empty="还没有记到游玩时长。" />
        ) : null}
        {current === "perfect" ? (
          <SteamList
            games={perfect}
            paidByApp={paidByApp}
            empty="还没有完美通关的游戏。游戏需要有 Steam 成就，且成就已全部解锁。"
          />
        ) : null}
        {current === "owned" ? (
          <OwnedList games={data.owned} paidByApp={paidByApp} />
        ) : null}
        {current === "family" ? (
          <>
            <FamilyHint error={data.familyError} loaded={data.family.length > 0} />
            <SteamList games={data.family} paidByApp={paidByApp} empty={familyEmpty(data)} />
          </>
        ) : null}
        {current === "want" ? <WantList items={wantItems} /> : null}
      </>
    );
  } catch (err) {
    const message =
      err instanceof ProviderNotConfiguredError
        ? err.message
        : err instanceof Error
          ? err.message
          : "读取 Steam 失败";
    return (
      <div className="steam-error">
        <SteamLiveGate />
        <p className="error">
          {message}
          {message.includes("STEAM_STEAMID") ? (
            <>
              {" "}
              个人资料链接里那串 17 位数字，或自定义主页名。
            </>
          ) : null}
        </p>
        <RefreshButton view={current} />
      </div>
    );
  }
}

function FamilyHint({ error, loaded }: { error: string | null; loaded: boolean }) {
  const hasToken = Boolean(
    process.env.STEAM_ACCESS_TOKEN?.trim() || process.env.STEAM_REFRESH_TOKEN?.trim(),
  );
  if (error || loaded || hasToken) return null;
  return (
    <p className="muted">
      家庭库要用登录 token（Web API Key 不够）。浏览器先登录{" "}
      <a href="https://store.steampowered.com/" target="_blank" rel="noreferrer">
        Steam 商店
      </a>
      ，再打开{" "}
      <a
        href="https://store.steampowered.com/pointssummary/ajaxgetasyncconfig"
        target="_blank"
        rel="noreferrer"
      >
        这页
      </a>
      ，把 <code>webapi_token</code> 填进 <code>local/.env</code> 的{" "}
      <code>STEAM_ACCESS_TOKEN</code>（大约一天过期）。有客户端{" "}
      <code>refresh_token</code> 就填 <code>STEAM_REFRESH_TOKEN</code>，本站会自动换新。
    </p>
  );
}

function familyEmpty(data: {
  familyError: string | null;
}): string {
  if (data.familyError) return data.familyError;
  const hasToken = Boolean(
    process.env.STEAM_ACCESS_TOKEN?.trim() || process.env.STEAM_REFRESH_TOKEN?.trim(),
  );
  if (!hasToken) return "还没有配置家庭库 token。";
  return "家庭库是空的。";
}

function SteamList({
  games,
  empty,
  paidByApp,
}: {
  games: SteamGameRow[];
  empty: string;
  paidByApp: Map<number, number>;
}) {
  if (games.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="grid">
      {games.map((game) => (
        <Link key={game.appid} href={`/steam/${game.appid}`} className="card">
          <Cover url={game.coverUrl} title={game.name} />
          <div className="card-body">
            <p className="card-title" title={game.name}>
              <span>{game.name}</span>
            </p>
            <GameCardStats game={game} paidFen={paidByApp.get(game.appid) ?? null} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function GameCardStats({
  game,
  paidFen,
}: {
  game: SteamGameRow;
  paidFen: number | null;
}) {
  const achTotal = game.achTotal ?? null;
  const achUnlocked = game.achUnlocked ?? null;
  const achText =
    achTotal != null && achTotal > 0
      ? `${achUnlocked ?? 0}/${achTotal}`
      : achTotal === 0
        ? "无"
        : "—";
  const achDone = achTotal != null && achTotal > 0 && achUnlocked === achTotal;
  const originalFen = game.originalFen;
  const paidShown = paidFen ?? originalFen;

  return (
    <dl className="card-stats">
      <div className="card-stat">
        <dt>总时长</dt>
        <dd>{formatHours(game.playtimeForeverMin)}</dd>
      </div>
      <div className="card-stat">
        <dt>近两周</dt>
        <dd>{formatHours(game.playtime2WeeksMin)}</dd>
      </div>
      <div className="card-stat">
        <dt>成就</dt>
        <dd className={achDone ? "card-stat-done" : undefined}>{achText}</dd>
      </div>
      <div className="card-stat">
        <dt>价格</dt>
        <dd>
          {formatFenLabel(paidShown)} / {formatFenLabel(originalFen)}
        </dd>
      </div>
    </dl>
  );
}

function OwnedList({
  games,
  paidByApp,
}: {
  games: SteamGameRow[];
  paidByApp: Map<number, number>;
}) {
  if (games.length === 0) {
    return (
      <p className="empty">
        库存是空的。到 Steam → 资料隐私，把「游戏详情」设为公开后再刷新。
      </p>
    );
  }
  let paidTotal = 0;
  for (const game of games) {
    const fen = paidByApp.get(game.appid) ?? game.originalFen;
    if (fen == null) continue;
    paidTotal += fen;
  }
  const originalKnown = games.filter((g) => g.originalFen != null);
  const originalTotal = originalKnown.reduce((sum, g) => sum + (g.originalFen ?? 0), 0);

  return (
    <>
      <p className="price-summary">
        购入总价 {formatYuan(paidTotal)}
        {`（未填按原价，已填 ${paidByApp.size}/${games.length}）`}
        {" · "}
        原价总价 {formatYuan(originalTotal)}
        {originalKnown.length < games.length
          ? `（${originalKnown.length} 款有商店价）`
          : ""}
      </p>
      <SteamList games={games} paidByApp={paidByApp} empty="" />
    </>
  );
}

async function loadWantItems(hideAppIds: number[]) {
  const hide = new Set(hideAppIds.map(String));
  return (
    await prisma.item.findMany({
      where: { type: "game", entry: { status: "wishlist" } },
      include: { entry: true },
      orderBy: { createdAt: "desc" },
    })
  ).filter((item) => !(item.source === "steam" && hide.has(item.sourceId)));
}

async function WantList({
  items,
}: {
  items: Awaited<ReturnType<typeof loadWantItems>>;
}) {
  return (
    <>
      <p className="muted">
        想玩的游戏记在这里。去 <Link href="/search?type=game">搜索</Link> 加入。
      </p>
      {items.length === 0 ? (
        <p className="empty">还没有想玩的。从搜索里加入后，状态选「想玩」。</p>
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
