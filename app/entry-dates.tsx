"use client";

import { useState } from "react";
import { statusLabel, statusOptionsFor } from "@/lib/constants";
import {
  applyStatusDate,
  entryDateFields,
  type EntryDateKey,
} from "@/lib/entry-dates";

export function EntryDates({
  type,
  status,
  wishlistOn,
  startedOn,
  finishedOn,
}: {
  type: string;
  status: string;
  wishlistOn: string | null;
  startedOn: string | null;
  finishedOn: string | null;
}) {
  const [current, setCurrent] = useState(status);
  const [dates, setDates] = useState<Record<EntryDateKey, string>>({
    wishlistOn: wishlistOn ?? "",
    startedOn: startedOn ?? "",
    finishedOn: finishedOn ?? "",
  });
  const fields = entryDateFields(type, current);

  function onStatusChange(next: string) {
    setCurrent(next);
    const stamped = applyStatusDate(type, current, next, {
      wishlistOn: dates.wishlistOn || null,
      startedOn: dates.startedOn || null,
      finishedOn: dates.finishedOn || null,
    });
    setDates({
      wishlistOn: stamped.wishlistOn ?? "",
      startedOn: stamped.startedOn ?? "",
      finishedOn: stamped.finishedOn ?? "",
    });
  }

  function bounds(key: EntryDateKey): { min?: string; max?: string } {
    const order = fields.map((f) => f.key);
    const i = order.indexOf(key);
    if (i < 0) return {};
    const earlier = order.slice(0, i).map((k) => dates[k]).filter(Boolean);
    const later = order.slice(i + 1).map((k) => dates[k]).filter(Boolean);
    return {
      min: earlier.length ? earlier.reduce((a, b) => (a > b ? a : b)) : undefined,
      max: later.length ? later.reduce((a, b) => (a < b ? a : b)) : undefined,
    };
  }

  return (
    <>
      <label>
        状态
        <select name="status" value={current} onChange={(e) => onStatusChange(e.target.value)}>
          {statusOptionsFor(type, status).map((s) => (
            <option key={s.value} value={s.value}>
              {statusLabel(s.value, type)}
            </option>
          ))}
        </select>
      </label>
      {fields.map((f) => {
        const { min, max } = bounds(f.key);
        return (
          <label key={f.key}>
            {f.label}
            <input
              type="date"
              name={f.key}
              value={dates[f.key]}
              min={min}
              max={max}
              onChange={(e) => setDates({ ...dates, [f.key]: e.target.value })}
            />
          </label>
        );
      })}
    </>
  );
}
