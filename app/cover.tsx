"use client";

import { useEffect, useState } from "react";

const CDN = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

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

function nextCover(src: string): string | null {
  const appMatch = src.match(/\/apps\/(\d+)\//);
  if (!appMatch) return null;
  const chain = steamCdnCovers(Number(appMatch[1]));
  const i = chain.findIndex((u) => src === u || src.startsWith(`${u}?`));
  if (i >= 0 && i + 1 < chain.length) return chain[i + 1];
  if (src.includes("library_600x900") && !src.includes("store_item_assets")) {
    return chain[0];
  }
  return null;
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
  const chainKey = chain.join("\n");
  const [src, setSrc] = useState<string | null>(chain[0] ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(chain[0] ?? null);
    setFailed(false);
  }, [chainKey]);

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
      onError={() => {
        const i = chain.findIndex((u) => src === u || src.startsWith(`${u}?`));
        const fromChain = i >= 0 ? chain[i + 1] : undefined;
        const fallback = fromChain || nextCover(src);
        if (fallback && fallback !== src) {
          setSrc(fallback);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
