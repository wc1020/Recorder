"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

function dataName(child: ReactElement): string {
  const props = child.props as { "data-name"?: string };
  return (props["data-name"] ?? "").toLowerCase();
}

function qKey(storageKey: string): string {
  return `pm-game-q:${storageKey}`;
}

export function GameTabSearch({
  storageKey,
  children,
  emptyFilter = "没有匹配的游戏。",
}: {
  storageKey: string;
  children: ReactNode;
  emptyFilter?: string;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    setQ(sessionStorage.getItem(qKey(storageKey)) ?? "");
  }, [storageKey]);

  function update(next: string) {
    setQ(next);
    const key = qKey(storageKey);
    if (next.trim()) sessionStorage.setItem(key, next);
    else sessionStorage.removeItem(key);
  }

  const needle = q.trim().toLowerCase();
  const items = Children.toArray(children).filter(isValidElement);
  const shown = needle
    ? items.filter((child) => dataName(child).includes(needle))
    : items;

  return (
    <>
      <form className="search-form" onSubmit={(e) => e.preventDefault()}>
        <input
          type="search"
          value={q}
          onChange={(e) => update(e.target.value)}
          placeholder="搜索当前列表"
          aria-label="搜索当前列表"
        />
      </form>
      {shown.length === 0 ? (
        <p className="empty">{emptyFilter}</p>
      ) : (
        <div className="grid">{shown}</div>
      )}
    </>
  );
}
