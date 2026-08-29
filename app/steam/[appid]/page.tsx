import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "../../cover";
import { PaidPriceButton } from "../../paid-price-button";
import { getSteamGamePage } from "@/lib/providers/steam";
import { formatFenLabel, formatPlaytime } from "@/lib/steam-format";
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
  const paidFen = (await listPaidFen([appid])).get(appid) ?? null;
  const paidShown = paidFen ?? data.originalFen;

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
            购入价 / 原价：{formatFenLabel(paidShown)} / {formatFenLabel(data.originalFen)}
          </p>
          {data.fromOwned ? (
            <PaidPriceButton appid={appid} paidFen={paidFen} />
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

function formatUnlock(unix: number): string {
  return new Date(unix * 1000).toLocaleString("zh-CN");
}
