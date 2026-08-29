"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SteamLiveGate() {
  const router = useRouter();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("live") !== "1") return;
    url.searchParams.delete("live");
    router.replace(url.pathname + url.search + url.hash);
  }, [router]);

  return null;
}
