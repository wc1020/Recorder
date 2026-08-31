"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { gamePageHref } from "@/lib/game-href";

export function RefreshButton({ view = "recent" }: { view?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-icon"
      disabled={pending}
      aria-label={pending ? "刷新中" : "刷新"}
      title={pending ? "刷新中…" : "刷新"}
      onClick={() =>
        start(() => {
          router.push(gamePageHref(view, true));
        })
      }
    >
      <svg
        className={pending ? "icon-spin" : undefined}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M8 16H3v5" />
      </svg>
    </button>
  );
}
