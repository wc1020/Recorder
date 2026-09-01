"use client";

import { useState } from "react";
import type { SteamAchievement } from "@/lib/providers/steam";

type Filter = "all" | "done" | "todo";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "全部成就" },
  { value: "done", label: "已完成" },
  { value: "todo", label: "未完成" },
];

export function AchievementList({ items }: { items: SteamAchievement[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown =
    filter === "done"
      ? items.filter((a) => a.unlocked)
      : filter === "todo"
        ? items.filter((a) => !a.unlocked)
        : items;

  return (
    <>
      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={filter === f.value ? "filter active" : "filter"}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="muted">没有匹配的成就。</p>
      ) : (
        <div className="ach-list">
          {shown.map((ach) => (
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
      )}
    </>
  );
}

function formatUnlock(unix: number): string {
  return new Date(unix * 1000).toLocaleString("zh-CN");
}
