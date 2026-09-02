"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshItem } from "./actions";

export function ItemRefreshButton({ itemId }: { itemId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="item-refresh-wrap">
      <button
        type="button"
        className="btn btn-icon item-refresh"
        disabled={pending}
        title={pending ? "刷新资料中…" : "刷新资料"}
        aria-label={pending ? "刷新资料中" : "刷新资料"}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await refreshItem(itemId);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
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
      {error ? <span className="error">{error}</span> : null}
    </span>
  );
}
