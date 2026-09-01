"use client";

import { useState, useTransition } from "react";
import { saveSteamPaidPrice } from "./actions";

export function PaidPriceButton({
  appid,
  paidFen,
  parentAppid,
}: {
  appid: number;
  paidFen: number | null;
  parentAppid?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <span className="paid-slot">
      {open ? (
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
          {parentAppid ? <input type="hidden" name="parentAppid" value={parentAppid} /> : null}
          <input
            name="paid"
            type="text"
            inputMode="decimal"
            defaultValue={paidFen != null ? String(paidFen / 100) : ""}
            placeholder="元"
            aria-label="购入价格（元）"
            autoFocus
          />
          <button type="submit" className="btn btn-mini" disabled={pending} aria-label="保存">
            {pending ? "…" : "√"}
          </button>
          <button
            type="button"
            className="btn btn-mini btn-ghost"
            onClick={() => setOpen(false)}
            aria-label="取消"
          >
            ×
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-mini"
          onClick={() => setOpen(true)}
          aria-label={paidFen != null ? "改购入价" : "填购入价"}
          title={paidFen != null ? "改购入价" : "填购入价"}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )}
    </span>
  );
}
