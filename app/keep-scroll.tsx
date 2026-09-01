"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function scrollKey(pathname: string, search: string): string {
  const sp = new URLSearchParams(search);
  sp.delete("live");
  sp.delete("saved");
  const q = sp.toString();
  return `pm-scroll:${pathname}${q ? `?${q}` : ""}`;
}

export function KeepScroll() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const key = scrollKey(pathname, search);

  useEffect(() => {
    const raw = sessionStorage.getItem(key);
    const top = raw ? Number(raw) : 0;
    const restore = () => {
      if (Number.isFinite(top) && top > 0) window.scrollTo(0, top);
    };
    restore();
    const raf = requestAnimationFrame(restore);
    const t = window.setTimeout(restore, 40);

    const save = () => sessionStorage.setItem(key, String(window.scrollY));
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a?.href || a.target === "_blank") return;
      save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("click", onClick, true);
    return () => {
      save();
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("click", onClick, true);
    };
  }, [key]);

  return null;
}
