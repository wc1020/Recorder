"use client";

import { useState, useTransition } from "react";
import { saveSteamPaidPrice } from "./actions";
import { formatYuan } from "@/lib/steam-format";

export function PaidPriceButton({
  appid,
  paidFen,
}: {
  appid: number;
  paidFen: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn btn-tiny" onClick={() => setOpen(true)}>
        {paidFen != null ? `购入 ${formatYuan(paidFen)}` : "填购入价"}
      </button>
    );
  }

  return (
    <form
      className="paid-form"
      action={(formData) => {
        start(async () => {
          await saveSteamPaidPrice(formData);
          setOpen(false);
        });
      }}
    >
      <input type="hidden" name="appid" value={appid} />
      <input
        name="paid"
        type="number"
        min="0"
        max="999999"
        step="0.01"
        defaultValue={paidFen != null ? String(paidFen / 100) : ""}
        placeholder="元"
        aria-label="购入价格（元）"
        autoFocus
      />
      <button type="submit" className="btn btn-tiny" disabled={pending}>
        {pending ? "…" : "保存"}
      </button>
      <button type="button" className="btn btn-tiny btn-ghost" onClick={() => setOpen(false)}>
        取消
      </button>
    </form>
  );
}
