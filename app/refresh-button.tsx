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
      className="btn"
      disabled={pending}
      aria-label={pending ? "Updating DB" : "Update DB"}
      title={pending ? "Updating…" : "Update DB"}
      onClick={() =>
        start(() => {
          router.push(gamePageHref(view, true));
        })
      }
    >
      {pending ? "Updating…" : "Update DB"}
    </button>
  );
}
