"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BackLink } from "./back-link";
import { GAME_VIEWS, gamePageHref, parseGameView } from "@/lib/game-href";
import {
  lastMediaType,
  mediaPageHref,
  parseMediaListQuery,
  typeListHref,
} from "@/lib/list-href";
import {
  collectionLabel,
  isMediaType,
  STATUSES,
  statusLabel,
} from "@/lib/constants";

function SubNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  if (
    pathname.startsWith("/steam") ||
    pathname.startsWith("/item") ||
    pathname.startsWith("/search")
  ) {
    return null;
  }

  const rawType = sp.get("type") ?? "";
  const type =
    rawType === "want" ? "game" : isMediaType(rawType) ? rawType : null;
  if (!type) return null;

  if (type === "game") {
    const current = rawType === "want" ? "want" : parseGameView(sp.get("view") ?? undefined);
    return (
      <nav className="header-subs" aria-label="分类">
        {GAME_VIEWS.map((v) => (
          <Link
            key={v.value}
            href={gamePageHref(v.value)}
            className={current === v.value ? "header-sub active" : "header-sub"}
          >
            {v.label}
          </Link>
        ))}
      </nav>
    );
  }

  const q = parseMediaListQuery({
    status: sp.get("status"),
    sort: sp.get("sort"),
    genre: sp.get("genre"),
    list: sp.get("list"),
    view: sp.get("view"),
  });
  const onLists = q.view === "lists" || Boolean(q.list);
  const sort = q.sort;
  return (
    <nav className="header-subs" aria-label="分类">
      <Link
        href={mediaPageHref(type, { sort })}
        className={!q.status && !onLists ? "header-sub active" : "header-sub"}
      >
        全部
      </Link>
      {STATUSES.map((s) => (
        <Link
          key={s.value}
          href={mediaPageHref(type, { status: s.value, sort })}
          className={!onLists && q.status === s.value ? "header-sub active" : "header-sub"}
        >
          {statusLabel(s.value, type)}
        </Link>
      ))}
      <Link
        href={mediaPageHref(type, { view: "lists", sort })}
        className={onLists ? "header-sub active" : "header-sub"}
      >
        {collectionLabel(type)}
      </Link>
    </nav>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [gameBack, setGameBack] = useState("/?type=game");
  const [itemBack, setItemBack] = useState("/");
  const [searchHref, setSearchHref] = useState("/search");

  useEffect(() => {
    setGameBack(typeListHref("game"));
    const raw = sp.get("type") ?? "";
    const urlType = raw === "want" ? "game" : isMediaType(raw) ? raw : null;
    const last = urlType ?? lastMediaType();
    if (last) {
      setItemBack(typeListHref(last));
      setSearchHref(`/search?type=${last}`);
    } else {
      setItemBack("/");
      setSearchHref("/search");
    }
  }, [pathname, sp]);

  const canBack = pathname.startsWith("/item/") || pathname.startsWith("/steam/");
  const backHref = pathname.startsWith("/steam/")
    ? gameBack
    : pathname.startsWith("/item/")
      ? itemBack
      : "/";
  const backIcon = (
    <>
      <span className="header-back-icon" aria-hidden />
      <span className="sr-only">返回</span>
    </>
  );

  return (
    <header className="site-header">
      <div className="header-back-slot">
        {canBack ? (
          <BackLink href={backHref} className="header-back">
            {backIcon}
          </BackLink>
        ) : (
          <span className="header-back is-disabled" aria-disabled="true">
            {backIcon}
          </span>
        )}
      </div>
      <div className="header-main">
        <span className="logo">ProjectM</span>
        <SubNav />
        <Link href={searchHref} className="header-search" title="搜索">
          <span className="header-search-icon" aria-hidden />
          <span className="sr-only">搜索</span>
        </Link>
      </div>
    </header>
  );
}
