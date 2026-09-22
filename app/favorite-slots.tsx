"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { Cover } from "./cover";
import {
  clearFavoriteRank,
  setFavoriteRank,
  setGameFavoriteByAppid,
} from "./actions";
import { FAVORITE_SLOTS, type MediaType } from "@/lib/constants";

export type FavoriteCandidate = {
  /** item:123 或 steam:456 */
  key: string;
  itemId: number | null;
  steamAppid: number | null;
  title: string;
  year: number | null;
  coverUrl: string | null;
  favoriteRank: number | null;
};

type SlotItem = FavoriteCandidate | null;

type Props = {
  type: MediaType;
  slots: SlotItem[];
  candidates: FavoriteCandidate[];
};

export function FavoriteSlots({ type, slots, candidates }: Props) {
  const padded: SlotItem[] = Array.from({ length: FAVORITE_SLOTS }, (_, i) => slots[i] ?? null);
  const [picking, setPicking] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (picking != null && !el.open) el.showModal();
    if (picking == null && el.open) el.close();
  }, [picking]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? candidates
      : candidates.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            (c.year != null && String(c.year).includes(q)) ||
            (c.steamAppid != null && String(c.steamAppid).includes(q)),
        );
    // 游戏库存可能很多，有搜索时多给一些
    return list.slice(0, q ? 120 : 80);
  }, [candidates, query]);

  function openPick(rank: number) {
    setError(null);
    setQuery("");
    setPicking(rank);
  }

  function choose(c: FavoriteCandidate) {
    if (picking == null) return;
    const rank = picking;
    setError(null);
    startTransition(async () => {
      try {
        if (c.itemId != null && c.itemId > 0) {
          await setFavoriteRank(c.itemId, rank);
        } else if (c.steamAppid != null) {
          await setGameFavoriteByAppid(c.steamAppid, rank);
        } else {
          throw new Error("无效的候选");
        }
        setPicking(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "设置失败");
      }
    });
  }

  function clear(itemId: number) {
    setError(null);
    startTransition(async () => {
      try {
        await clearFavoriteRank(itemId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "清除失败");
      }
    });
  }

  return (
    <>
      <div className="home-posters is-fav">
        {padded.map((item, i) => {
          const rank = i + 1;
          if (!item || item.itemId == null) {
            return (
              <button
                key={`empty-${rank}`}
                type="button"
                className="home-poster home-poster-empty"
                onClick={() => openPick(rank)}
                disabled={pending}
                aria-label={`选择第 ${rank} 个最喜欢`}
              >
                <span className="home-poster-plus" aria-hidden>
                  +
                </span>
                <span className="home-poster-empty-label">添加</span>
              </button>
            );
          }
          return (
            <div key={item.itemId} className="home-poster-wrap">
              <Link
                href={
                  type === "game" && item.steamAppid != null
                    ? `/steam/${item.steamAppid}`
                    : `/item/${item.itemId}`
                }
                className="home-poster"
                title={item.title}
              >
                <Cover
                  url={item.coverUrl}
                  appid={type === "game" ? (item.steamAppid ?? undefined) : undefined}
                  title={item.title}
                  size="md"
                  orientation={type === "game" ? "portrait" : "landscape"}
                />
                <span className="home-poster-caption">{item.title}</span>
              </Link>
              <div className="home-poster-tools">
                <button
                  type="button"
                  className="home-poster-tool"
                  onClick={() => openPick(rank)}
                  disabled={pending}
                >
                  更换
                </button>
                <button
                  type="button"
                  className="home-poster-tool"
                  onClick={() => clear(item.itemId!)}
                  disabled={pending}
                >
                  移除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <dialog
        ref={dialogRef}
        className="favorite-pick-dialog"
        aria-labelledby={titleId}
        onClose={() => setPicking(null)}
      >
        {picking != null ? (
          <div className="favorite-pick-panel">
            <div className="favorite-pick-bar">
              <h2 id={titleId} className="favorite-pick-title">
                选择最喜欢（第 {picking} 格）
              </h2>
              <button
                type="button"
                className="btn btn-mini btn-ghost"
                onClick={() => dialogRef.current?.close()}
              >
                关闭
              </button>
            </div>
            <input
              className="favorite-pick-search"
              type="search"
              placeholder={type === "game" ? "按标题 / AppID 筛选…" : "按标题筛选…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {error ? <p className="error">{error}</p> : null}
            {!candidates.length ? (
              <p className="muted">
                {type === "game"
                  ? "本地还没有 Steam 库存备份，先去游戏页刷新。"
                  : "这个类型还没有条目，先去加入一些吧。"}
              </p>
            ) : (
              <ul className="favorite-pick-list">
                {filtered.map((c) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      className="favorite-pick-row"
                      onClick={() => choose(c)}
                      disabled={pending}
                    >
                      <Cover
                        url={c.coverUrl}
                        appid={type === "game" ? (c.steamAppid ?? undefined) : undefined}
                        title={c.title}
                        size="sm"
                        orientation={type === "game" ? "portrait" : "landscape"}
                      />
                      <span className="favorite-pick-meta">
                        <span className="favorite-pick-name">{c.title}</span>
                        <span className="muted">
                          {c.year ?? (c.steamAppid != null ? `App ${c.steamAppid}` : "—")}
                          {c.favoriteRank != null ? ` · 已在第 ${c.favoriteRank} 格` : ""}
                          {c.itemId == null && c.steamAppid != null ? " · 未入库" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {!filtered.length ? (
                  <li className="muted favorite-pick-none">没有匹配的条目。</li>
                ) : null}
              </ul>
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
