import Link from "next/link";
import { Cover } from "./cover";
import { ProfileRefreshButton } from "./profile-refresh-button";
import { RefreshButton } from "./refresh-button";
import { SteamLiveGate } from "./steam-live-gate";
import { GameFilterInput, GameFilterProvider, GameTabSearch } from "./game-tab-search";
import { parseGameView } from "@/lib/game-href";
import {
  cachedPerfectCount,
  filterPerfectGames,
  getSteamPlayerPage,
  type SteamGameRow,
  type SteamXp,
} from "@/lib/providers/steam";
import { buildGameViews } from "@/lib/steam-views";
import { formatBackupTime, formatFenLabel, formatHourNumber, formatHours, gamePriceFen } from "@/lib/steam-format";
import { ProviderNotConfiguredError } from "@/lib/providers";
import { formatRating, statusLabel } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { loadLocalEnv } from "@/lib/load-local-env";
import { listPaidFen } from "@/lib/steam-paid";

export async function SteamPanel({
  view,
  live = false,
}: {
  view?: string;
  live?: boolean;
}) {
  const current = parseGameView(view);
  loadLocalEnv({ reload: true });
  try {
    const data = await getSteamPlayerPage({ live });
    const views = buildGameViews(data);
    const priceAppids = [
      ...views.library.map((g) => g.appid),
      ...views.owned.flatMap((g) => (g.dlcPrices ?? []).map((d) => d.appid)),
    ];
    const paidByApp = await listPaidFen(priceAppids);
    const hideAppIds = [
      ...views.owned.map((g) => g.appid),
      ...views.family.map((g) => g.appid),
    ];
    const wantItems = await loadWantItems(hideAppIds);
    const perfect =
      current === "perfect"
        ? await filterPerfectGames(views.library, { fromCache: data.fromCache })
        : [];
    const prices = ownedPriceTotals(views.owned, paidByApp);

    return (
      <GameFilterProvider storageKey={current}>
        <SteamLiveGate />
        <div className="steam-profile-row">
        <section
          className={
            data.profile.miniBackgroundUrl || data.profile.miniBackgroundMovieUrl
              ? "steam-profile has-mini-bg"
              : "steam-profile"
          }
        >
          {data.profile.miniBackgroundMovieUrl ? (
            <video
              className="steam-profile-bg"
              src={data.profile.miniBackgroundMovieUrl}
              autoPlay
              loop
              muted
              playsInline
            />
          ) : data.profile.miniBackgroundUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="steam-profile-bg" src={data.profile.miniBackgroundUrl} alt="" />
          ) : null}
          {data.profile.miniBackgroundUrl || data.profile.miniBackgroundMovieUrl ? (
            <div className="steam-profile-bg-dim" />
          ) : null}
          <ProfileRefreshButton />
          <div className="steam-profile-top">
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
            <div className="steam-profile-id">
              <h2 className="steam-name-row">
                <span className="steam-name">{data.profile.name}</span>
                <span
                  className={`steam-presence is-${data.profile.presence ?? "offline"}`}
                >
                  {data.profile.presence === "ingame"
                    ? `游玩${data.profile.playingName || "游戏"}中`
                    : data.profile.presence === "online"
                      ? "在线"
                      : "离线"}
                </span>
              </h2>
              <a href={data.profile.profileUrl} target="_blank" rel="noreferrer">
                公开资料
              </a>
            </div>
          </div>
          <div className="steam-profile-metrics">
            <p className="steam-metric">
              <span className="steam-metric-label">游玩时长</span>
              <span className="steam-metric-value">
                {formatHourNumber(data.totalPlaytimeMin)} h
              </span>
            </p>
            <p className="steam-metric">
              <span className="steam-metric-label">库存价值</span>
              <span className="steam-metric-value">
                {views.owned.length > 0
                  ? `${(prices.paidTotal / 100).toFixed(2)} / ${(prices.originalTotal / 100).toFixed(2)} ￥`
                  : "—"}
              </span>
            </p>
          </div>
        </section>
        <SteamOverview
          xp={data.xp ?? null}
          owned={views.owned.length}
          family={views.family.length}
          perfect={cachedPerfectCount(views.library)}
          want={wantItems.length}
          recent={views.recent}
        />
        <div className="steam-profile-tools">
          <RefreshButton view={current} />
          <GameFilterInput />
        </div>
        </div>
        {data.familyError ? <p className="muted">{data.familyError}</p> : null}
        {data.cacheReason === "offline" ? (
          <p className="muted">
            当前是本地备份
            {data.cachedAt ? `（${formatBackupTime(data.cachedAt)}）` : ""}
            。连上 Steam 后点刷新会覆盖这份备份。
          </p>
        ) : null}

        {current === "recent" ? (
          <SteamList
            games={views.recent}
            paidByApp={paidByApp}
            empty="近两周没有在库存或家庭库里的游玩记录。"
          />
        ) : null}
        {current === "played" ? (
          <SteamList
            games={views.played}
            paidByApp={paidByApp}
            empty="库存和家庭库里还没有游玩时长。"
          />
        ) : null}
        {current === "perfect" ? (
          <SteamList
            games={perfect}
            paidByApp={paidByApp}
            empty="还没有完美通关的游戏。库存和家庭库里成就已全部解锁的都会列在这里。"
          />
        ) : null}
        {current === "owned" ? (
          <OwnedList games={views.owned} paidByApp={paidByApp} />
        ) : null}
        {current === "family" ? (
          <>
            <FamilyHint error={data.familyError} loaded={views.family.length > 0} />
            <SteamList
              games={views.family}
              paidByApp={paidByApp}
              empty={familyEmpty(data)}
            />
          </>
        ) : null}
        {current === "want" ? <WantList items={wantItems} /> : null}
      </GameFilterProvider>
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

function xpPercent(xp: SteamXp): number {
  const into = Math.max(0, xp.xp - xp.xpCurrentLevel);
  const span = into + Math.max(0, xp.xpToNext);
  if (span <= 0) return 100;
  return Math.min(100, Math.round((into / span) * 100));
}

function SteamOverview({
  xp,
  owned,
  family,
  perfect,
  want,
  recent,
}: {
  xp: SteamXp | null;
  owned: number;
  family: number;
  perfect: number | null;
  want: number;
  recent: SteamGameRow[];
}) {
  const counts: { label: string; value: string }[] = [
    { label: "库存", value: String(owned) },
    { label: "家庭库", value: String(family) },
    { label: "完美通关", value: perfect == null ? "—" : String(perfect) },
    { label: "想玩", value: String(want) },
  ];
  const covers = recent.slice(0, 5);
  const pct = xp ? xpPercent(xp) : 0;

  return (
    <div className="steam-overview">
      <div className="steam-overview-meta">
      <div className="steam-level">
        <p className="steam-level-label">
          等级 <strong>{xp ? xp.level : "—"}</strong>
          {xp ? <span className="steam-level-xp">{pct}%</span> : null}
        </p>
        <div className="steam-xp" role="meter" aria-label="Steam 经验" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="steam-xp-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="steam-counts">
        {counts.map((c) => (
          <div key={c.label} className="steam-count">
            <strong>{c.value}</strong>
            <span>{c.label}</span>
          </div>
        ))}
      </div>
      </div>
      {covers.length > 0 ? (
        <div className="steam-recent-strip">
          {covers.map((g) => (
            <Link key={g.appid} href={`/steam/${g.appid}`} title={g.name} className="steam-recent-cover">
              <Cover appid={g.appid} url={g.coverUrl} title={g.name} size="wide" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="steam-overview-empty">近两周没有游玩记录</p>
      )}
    </div>
  );
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
      <code>STEAM_ACCESS_TOKEN</code>（大约一天过期）。改完后要点「刷新」，切
      tab 仍用本地备份。有客户端 <code>refresh_token</code> 就填{" "}
      <code>STEAM_REFRESH_TOKEN</code>，本站会自动换新。
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

function isCardPerfect(game: SteamGameRow): boolean {
  return (
    game.achTotal != null &&
    game.achTotal > 0 &&
    game.achUnlocked === game.achTotal
  );
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
    <GameTabSearch>
      {games.map((game) => (
        <Link
          key={game.appid}
          href={`/steam/${game.appid}`}
          data-name={game.name}
          className={isCardPerfect(game) ? "card card-perfect" : "card"}
        >
          <Cover url={game.coverUrl} title={game.name} />
          <div className="card-body">
            <p className="card-title" title={game.name}>
              <span>{game.name}</span>
            </p>
            <GameCardStats game={game} paidByApp={paidByApp} />
          </div>
        </Link>
      ))}
    </GameTabSearch>
  );
}

function GameCardStats({
  game,
  paidByApp,
}: {
  game: SteamGameRow;
  paidByApp: Map<number, number>;
}) {
  const achTotal = game.achTotal ?? null;
  const achUnlocked = game.achUnlocked ?? null;
  const achText =
    achTotal != null && achTotal > 0
      ? `${achUnlocked ?? 0} / ${achTotal}`
      : achTotal === 0
        ? "无"
        : "—";
  const achDone = achTotal != null && achTotal > 0 && achUnlocked === achTotal;
  const prices = gamePriceFen(game.appid, game.originalFen, game.dlcPrices, paidByApp);

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
          {formatFenLabel(prices.paid)} / {formatFenLabel(prices.original)}
        </dd>
      </div>
    </dl>
  );
}

function ownedPriceTotals(
  games: SteamGameRow[],
  paidByApp: Map<number, number>,
) {
  let paidTotal = 0;
  let originalTotal = 0;
  for (const game of games) {
    const prices = gamePriceFen(game.appid, game.originalFen, game.dlcPrices, paidByApp);
    if (prices.paid != null) paidTotal += prices.paid;
    if (prices.original != null) originalTotal += prices.original;
  }
  return { paidTotal, originalTotal };
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
  return <SteamList games={games} paidByApp={paidByApp} empty="" />;
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
        <GameTabSearch>
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/item/${item.id}`}
              data-name={item.title}
              className="card"
            >
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
        </GameTabSearch>
      )}
    </>
  );
}
