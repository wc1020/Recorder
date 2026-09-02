"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { refreshSteamOnIdle } from "./actions";
import { IDLE_REFRESH_MS } from "@/lib/constants";

function currentSteamAppid(pathname: string): number | undefined {
  const m = pathname.match(/^\/steam\/(\d+)/);
  if (!m) return undefined;
  const appid = Number(m[1]);
  return Number.isInteger(appid) && appid > 0 ? appid : undefined;
}

/** 连续 15 分钟没有任何操作后，才自动更新本地备份。 */
export function IdleRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const pathRef = useRef(pathname);
  const lastRef = useRef(Date.now());
  pathRef.current = pathname;

  useEffect(() => {
    let timer: number | undefined;
    let running = false;

    const pull = async () => {
      if (running) return;
      running = true;
      lastRef.current = Date.now();
      try {
        await refreshSteamOnIdle(currentSteamAppid(pathRef.current));
        router.refresh();
      } catch {
        /* 自动更新失败就等下一轮 */
      } finally {
        running = false;
        arm();
      }
    };

    const arm = () => {
      window.clearTimeout(timer);
      const wait = Math.max(0, IDLE_REFRESH_MS - (Date.now() - lastRef.current));
      timer = window.setTimeout(() => {
        void pull();
      }, wait);
    };

    const mark = () => {
      lastRef.current = Date.now();
      arm();
    };

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRef.current >= IDLE_REFRESH_MS) {
        void pull();
        return;
      }
      arm();
    };

    const evts = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const ev of evts) {
      window.addEventListener(ev, mark, { passive: true });
    }
    document.addEventListener("visibilitychange", onVis);
    arm();
    return () => {
      window.clearTimeout(timer);
      for (const ev of evts) {
        window.removeEventListener(ev, mark);
      }
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router]);

  return null;
}
