"use client";

import { useLayoutEffect, useState } from "react";

const CDN = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
const memory = new Map<number, string>();

function uniq(urls: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

/** Steam CDN 横图优先，没有再用已保存的封面。 */
function steamCdnCovers(appid: number, extra?: string | null): string[] {
  return uniq([
    `${CDN}/${appid}/header_schinese.jpg`,
    `${CDN}/${appid}/header.jpg`,
    `${CDN}/${appid}/library_hero.jpg`,
    extra,
  ]);
}

function coverKey(appid: number): string {
  return `pm-cover:${appid}`;
}

function rememberedCover(appid: number): string | null {
  const hit = memory.get(appid);
  if (hit) return hit;
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(coverKey(appid));
  } catch {
    return null;
  }
}

function rememberCover(appid: number, src: string): void {
  memory.set(appid, src);
  try {
    localStorage.setItem(coverKey(appid), src);
  } catch {
    /* 配额满了就只靠内存 */
  }
}

export function Cover({
  url,
  appid,
  title,
  size = "md",
}: {
  url?: string | null;
  appid?: number;
  title: string;
  size?: "sm" | "md" | "lg" | "wide";
}) {
  const chain = uniq(appid ? steamCdnCovers(appid, url) : [url]);
  const [src, setSrc] = useState<string | null>(() => {
    if (appid != null) return rememberedCover(appid) ?? chain[0] ?? null;
    return chain[0] ?? null;
  });
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    const next =
      appid != null ? (rememberedCover(appid) ?? chain[0] ?? null) : (chain[0] ?? null);
    setSrc(next);
    setFailed(false);
  }, [appid, url]);

  const cls = `cover cover-${size}`;
  if (!src || failed) {
    return (
      <div className={`${cls} cover-empty`} aria-hidden>
        {title.slice(0, 1)}
      </div>
    );
  }
  return (
    // 封面是外部 URL，第一版不下载、不走 next/image 优化
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={cls}
      src={src}
      alt={title}
      onLoad={() => {
        if (appid != null) rememberCover(appid, src);
      }}
      onError={() => {
        const i = chain.findIndex((u) => src === u || src.startsWith(`${u}?`));
        const fallback = i >= 0 ? chain[i + 1] : undefined;
        if (fallback && fallback !== src) {
          setSrc(fallback);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
