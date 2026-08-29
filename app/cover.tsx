"use client";

import { useEffect, useState } from "react";

function nextCover(src: string): string | null {
  const appMatch = src.match(/\/apps\/(\d+)\//);
  if (!appMatch) return null;
  const appid = appMatch[1];
  const headerZh = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header_schinese.jpg`;
  const headerEn = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
  if (src.includes("library_600x900") && !src.includes("store_item_assets")) {
    return headerZh;
  }
  if (src.includes("header_schinese.jpg")) return headerEn;
  return null;
}

export function Cover({
  url,
  title,
  size = "md",
}: {
  url: string | null;
  title: string;
  size?: "sm" | "md" | "lg";
}) {
  const [src, setSrc] = useState(url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(url);
    setFailed(false);
  }, [url]);

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
        const fallback = nextCover(src);
        if (fallback && fallback !== src) {
          setSrc(fallback);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
