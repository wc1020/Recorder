import { notFound } from "next/navigation";
import { AchievementList } from "../../achievement-list";
import { Cover } from "../../cover";
import { PaidPriceButton } from "../../paid-price-button";
import { getSteamGamePage, type SteamDlcRow } from "@/lib/providers/steam";
import { formatFenLabel, formatHourNumber, gamePriceFen } from "@/lib/steam-format";
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
      <p className="error">{message}</p>
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
      <div className="detail detail-game">
        <Cover url={data.coverUrl} title={data.name} size="lg" />
        <div className="detail-info">
          <h1 title={data.name}>{data.name}</h1>
          <p className="muted detail-play">
            总时长 <span className="detail-num">{formatHourNumber(data.playtimeForeverMin)}</span>{" "}
            小时，近两周 <span className="detail-num">{formatHourNumber(data.playtime2WeeksMin)}</span>{" "}
            小时
          </p>
          <div className="muted price-line">
            本体：{formatFenLabel(prices.basePaid)} / {formatFenLabel(prices.baseOriginal)}
            {data.fromOwned ? (
              <PaidPriceButton appid={appid} paidFen={paidByApp.get(appid) ?? null} />
            ) : null}
          </div>
          <p className="muted detail-sum">
            合计：{formatFenLabel(prices.paid)} / {formatFenLabel(prices.original)}
          </p>
          {data.review ? (
            <p className="review-box">
              评价：{data.review.label}
              {data.review.percent != null ? ` ${data.review.percent}%` : ""}
              {` · ${data.review.total} 篇评测`}
            </p>
          ) : (
            <p className="muted detail-review">评价：暂无评测摘要</p>
          )}
          {data.description ? (
            <p className="detail-desc" title={data.description}>
              {data.description}
            </p>
          ) : null}
          <p className="detail-store">
            <a href={data.storeUrl} target="_blank" rel="noreferrer">
              Steam商店页
            </a>
          </p>
        </div>
      </div>
      {!data.fromOwned && data.fromFamily ? (
        <p className="muted">家庭库游戏，时长来自家庭共享记录。</p>
      ) : null}
      {!data.fromOwned && !data.fromFamily ? (
        <p className="muted">
          不在个人库存里（家庭库很常见）。时长按「最近游玩」记录，两周没玩过就拉不到。
        </p>
      ) : null}

      <h2 className="section-title">
        DLC
        {data.dlc.length > 0 ? `（${ownedDlc} / ${data.dlc.length}）` : ""}
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
        {total > 0 ? `（${unlocked} / ${total}）` : ""}
      </h2>
      {data.achievementError ? <p className="muted">{data.achievementError}</p> : null}
      {data.achievements && data.achievements.length > 0 ? (
        <AchievementList items={data.achievements} />
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
      <Cover url={row.coverUrl} title={row.name} size="wide" />
      <div className="dlc-body">
        <p className="dlc-name">{row.name}</p>
        <div className="dlc-meta">
          <span className={row.owned ? "dlc-tag" : "dlc-tag off"}>
            {row.owned ? "已购" : "未购"}
          </span>
          <span className="dlc-price">
            购入 {formatFenLabel(linePaid)} / 原价 {formatFenLabel(row.originalFen)}
          </span>
          <PaidPriceButton
            appid={row.appid}
            paidFen={paidFen}
            parentAppid={parentAppid}
          />
        </div>
      </div>
    </div>
  );
}
