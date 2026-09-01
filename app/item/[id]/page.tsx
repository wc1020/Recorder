import { notFound } from "next/navigation";
import { saveEntry } from "../../actions";
import { Cover } from "../../cover";
import { STATUSES, statusLabel, typeLabel } from "@/lib/constants";
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
    include: { entry: true },
  });
  if (!item) notFound();

  const entry = item.entry;

  return (
    <>
      <div className="detail">
      <Cover url={item.coverUrl} title={item.title} size="lg" />
      <div className="detail-info">
        <p className="muted">
          {typeLabel(item.type)}
          {item.year ? ` · ${item.year}` : ""}
        </p>
        <h1>{item.title}</h1>
        {item.originalTitle ? <p className="muted">{item.originalTitle}</p> : null}
        {item.description ? <p>{item.description}</p> : null}

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
      </div>
    </div>
    </>
  );
}
