"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import { isMediaType, MEDIA_TYPES, type MediaType } from "@/lib/constants";
import { typeListHref } from "@/lib/list-href";

const TYPE_ICONS: Record<MediaType, string> = {
  movie: "/icons/film-reel.svg",
  tv: "/icons/television.svg",
  book: "/icons/book.svg",
  game: "/icons/game-controller.svg",
};

function currentNav(pathname: string, raw: string): "home" | MediaType | null {
  if (pathname.startsWith("/steam") || raw === "want") return "game";
  if (isMediaType(raw)) return raw;
  if (pathname === "/") return "home";
  if (pathname.startsWith("/search")) return "movie";
  return null;
}

export function TypeNav() {
  const pathname = usePathname();
  const router = useRouter();
  const nav = currentNav(pathname, useSearchParams().get("type") ?? "");

  return (
    <nav className="site-nav" aria-label="类型">
      <Link href="/" className={nav === "home" ? "tab active" : "tab"}>
        <span
          className="tab-icon"
          style={{ "--tab-icon": 'url("/icons/house.svg")' } as CSSProperties}
          aria-hidden
        />
        <span className="tab-label">首页</span>
      </Link>
      {MEDIA_TYPES.map((t) => (
        <Link
          key={t.value}
          href={`/?type=${t.value}`}
          className={t.value === nav ? "tab active" : "tab"}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
              return;
            }
            e.preventDefault();
            router.push(typeListHref(t.value));
          }}
        >
          <span
            className="tab-icon"
            style={{ "--tab-icon": `url("${TYPE_ICONS[t.value]}")` } as CSSProperties}
            aria-hidden
          />
          <span className="tab-label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
