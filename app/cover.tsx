"use client";

import { useLayoutEffect, useState } from "react";

const CDN = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
type Orientation = "landscape" | "portrait";
const memory = new Map<string, string>();
/** 404 过的 CDN 地址，避免 effect 重置或 Strict Mode 重挂再请求同一张死图。 */
const dead = new Set<string>();

function firstLive(chain: string[]): string | null {
  return chain.find((u) => !dead.has(u)) ?? null;
}

function uniq(urls: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

function isPortraitSrc(src: string): boolean {
  return /library_600x900|library_capsule/i.test(src);
}

function isLandscapeSrc(src: string): boolean {
  return /\/(header(?:_schinese)?|library_hero)\.(jpg|png)/i.test(src);
}

/** Steam CDN：列表横条用横图；首页海报墙用竖版库封面。 */
function steamCdnCovers(
  appid: number,
  extra: string | null | undefined,
  orientation: Orientation,
): string[] {
  const header = [
    `${CDN}/${appid}/header_schinese.jpg`,
    `${CDN}/${appid}/header.jpg`,
    `${CDN}/${appid}/library_hero.jpg`,
  ];
  const portrait = [
    `${CDN}/${appid}/library_600x900_2x.jpg`,
    `${CDN}/${appid}/library_600x900.jpg`,
    `${CDN}/${appid}/library_capsule_2x.jpg`,
    `${CDN}/${appid}/library_capsule.jpg`,
  ];
  if (orientation === "portrait") {
    const extraOk = extra && !isLandscapeSrc(extra) ? extra : null;
    return uniq([...portrait, extraOk, extra, ...header]);
  }
  // 横条：不要把库存竖封面插在 header 前面
  const extraOk = extra && !isPortraitSrc(extra) ? extra : null;
  return uniq([...header, extraOk, ...portrait]);
}

function coverKey(appid: number, orientation: Orientation): string {
  return `pm-cover:${orientation}:${appid}`;
}

function rememberedCover(appid: number, orientation: Orientation): string | null {
  const key = coverKey(appid, orientation);
  const hit = memory.get(key);
  if (hit && !dead.has(hit)) return hit;
  if (typeof localStorage === "undefined") return null;
  try {
    const typed = localStorage.getItem(key);
    if (typed && !dead.has(typed)) return typed;
    // 兼容旧 key；方向对不上就丢弃
    const legacy = localStorage.getItem(`pm-cover:${appid}`);
    if (!legacy) return null;
    if (orientation === "portrait" && isLandscapeSrc(legacy)) return null;
    if (orientation === "landscape" && isPortraitSrc(legacy)) return null;
    return legacy;
  } catch {
    return null;
  }
}

function rememberCover(appid: number, orientation: Orientation, src: string): void {
  if (dead.has(src)) return;
  const key = coverKey(appid, orientation);
  memory.set(key, src);
  try {
    localStorage.setItem(key, src);
  } catch {
    /* 配额满了就只靠内存 */
  }
}

export function Cover({
  url,
  appid,
  title,
  size = "md",
  orientation = "landscape",
}: {
  url?: string | null;
  appid?: number;
  title: string;
  size?: "sm" | "md" | "lg" | "wide";
  /** Steam：portrait 优先竖版库封面（首页大海报）；默认横图。 */
  orientation?: Orientation;
}) {
  const chain = uniq(appid ? steamCdnCovers(appid, url, orientation) : [url]);
  // 首屏两边都用 chain[0]，避免 localStorage 记忆封面导致 hydration 对不上
  const [src, setSrc] = useState<string | null>(() => chain[0] ?? null);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    const remembered = appid != null ? rememberedCover(appid, orientation) : null;
    const usable =
      remembered &&
      (orientation === "portrait" ? !isLandscapeSrc(remembered) : !isPortraitSrc(remembered));
    const next = (usable ? remembered : null) ?? firstLive(chain);
    setSrc(next);
    setFailed(!next);
  }, [appid, url, orientation]);

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
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth === 0) {
          if (src) dead.add(src);
          const fallback = firstLive(chain);
          if (fallback && fallback !== src) {
            setSrc(fallback);
            return;
          }
          setFailed(true);
          return;
        }
        if (appid != null) rememberCover(appid, orientation, src);
      }}
      onError={() => {
        if (src) dead.add(src);
        const fallback = firstLive(chain);
        if (fallback && fallback !== src) {
          setSrc(fallback);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
