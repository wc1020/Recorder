import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "../../cover";
import { PaidPriceButton } from "../../paid-price-button";
import { getSteamGamePage, type SteamDlcRow } from "@/lib/providers/steam";
import { formatFenLabel, formatPlaytime, gamePriceFen } from "@/lib/steam-format";
import { listPaidFen } from "@/lib/steam-paid";

export const dynamic = "force-dynamic";

export default async function SteamGamePage({
  params,
}: {
  params: Promise<{ appid: string }>;
}) {
  const { appid: raw } = await params;
  const appid = Number(raw);
  if (!Number.isInteger(appid) || appid <= 0) notFound();

  let data;
  try {
    data = await getSteamGamePage(appid);
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取失败";
    return (
      <>
        <p>
          <Link href="/?type=game">← 游戏</Link>
        </p>
        <p className="error">{message}</p>
      </>
    );
  }

  const unlocked = data.achievements?.filter((a) => a.unlocked).length ?? 0;
  const total = data.achievements?.length ?? 0;
  const paidByApp = await listPaidFen([
    appid,
    ...data.dlc.map((row) => row.appid),
  ]);
  const prices = gamePriceFen(
    appid,
    data.originalFen,
    data.dlc.map((row) => ({
      appid: row.appid,
      originalFen: row.originalFen,
      owned: row.owned,
    })),
    paidByApp,
  );
  const ownedDlc = data.dlc.filter((row) => row.owned).length;

  return (
    <>
      <p>
        <Link href="/?type=game">← 游戏</Link>
      </p>
      <div className="detail">
        <Cover url={data.coverUrl} title={data.name} size="lg" />
        <div className="detail-info">
          <h1>{data.name}</h1>
          <p className="muted">
            {formatPlaytime(data.playtimeForeverMin, data.playtime2WeeksMin)}
          </p>
          <p className="muted">
            购入价 / 原价：{formatFenLabel(prices.paid)} / {formatFenLabel(prices.original)}
          </p>
          {data.fromOwned ? (
            <PaidPriceButton appid={appid} paidFen={paidByApp.get(appid) ?? null} />
          ) : null}
          {!data.fromOwned && data.fromFamily ? (
            <p className="muted">家庭库游戏，时长来自家庭共享记录。</p>
          ) : null}
          {!data.fromOwned && !data.fromFamily ? (
            <p className="muted">
              不在个人库存里（家庭库很常见）。时长按「最近游玩」记录，两周没玩过就拉不到。
            </p>
          ) : null}
          {data.review ? (
            <p className="review-box">
              评价：{data.review.label}
              {data.review.percent != null ? ` ${data.review.percent}%` : ""}
              {` · ${data.review.total} 篇评测`}
            </p>
          ) : (
            <p className="muted">暂无评测摘要。</p>
          )}
          {data.description ? <p>{data.description}</p> : null}
          <p>
            <a href={data.storeUrl} target="_blank" rel="noreferrer">
              在 Steam 商店打开
            </a>
          </p>
        </div>
      </div>

      <h2 className="section-title">
        DLC
        {data.dlc.length > 0
          ? `（已购 ${ownedDlc}/${data.dlc.length}）`
          : ""}
      </h2>
      {data.dlcError ? <p className="muted">{data.dlcError}</p> : null}
      {data.dlc.length === 0 && !data.dlcError ? (
        <p className="muted">没有 DLC。</p>
      ) : null}
      {data.dlc.length > 0 ? (
        <div className="dlc-list">
          {data.dlc.map((row) => (
            <DlcRow
              key={row.appid}
              row={row}
              parentAppid={appid}
              paidFen={paidByApp.get(row.appid) ?? null}
            />
          ))}
        </div>
      ) : null}

      <h2 className="section-title">
        我的成就
        {total > 0 ? `（${unlocked}/${total}）` : ""}
      </h2>
      {data.achievementError ? <p className="muted">{data.achievementError}</p> : null}
      {data.achievements && data.achievements.length > 0 ? (
        <div className="ach-list">
          {data.achievements.map((ach) => (
            <div key={ach.id} className={ach.unlocked ? "ach-row" : "ach-row locked"}>
              {ach.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ach-icon" src={ach.iconUrl} alt="" />
              ) : (
                <div className="ach-icon cover-empty" />
              )}
              <div>
                <p className="ach-name">{ach.name}</p>
                {ach.description ? <p className="muted">{ach.description}</p> : null}
                <p className="card-meta">
                  {ach.unlocked
                    ? `已解锁${ach.unlockTime ? ` · ${formatUnlock(ach.unlockTime)}` : ""}`
                    : "未解锁"}
                  {typeof ach.percent === "number" && Number.isFinite(ach.percent)
                    ? ` · ${ach.percent.toFixed(1)}% 玩家`
                    : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function DlcRow({
  row,
  parentAppid,
  paidFen,
}: {
  row: SteamDlcRow;
  parentAppid: number;
  paidFen: number | null;
}) {
  const linePaid = paidFen ?? (row.owned ? row.originalFen : null);
  return (
    <div className={row.owned ? "dlc-row" : "dlc-row locked"}>
      <Cover url={row.coverUrl} title={row.name} size="sm" />
      <div className="dlc-body">
        <p className="ach-name">{row.name}</p>
        <p className="card-meta">
          {row.owned ? "已购买" : "未购买"}
          {` · 购入 ${formatFenLabel(linePaid)} / 原价 ${formatFenLabel(row.originalFen)}`}
        </p>
        <p>
          <a href={row.storeUrl} target="_blank" rel="noreferrer">
            Steam 商店
          </a>
        </p>
        <PaidPriceButton
          appid={row.appid}
          paidFen={paidFen}
          parentAppid={parentAppid}
        />
      </div>
    </div>
  );
}

function formatUnlock(unix: number): string {
  return new Date(unix * 1000).toLocaleString("zh-CN");
}
