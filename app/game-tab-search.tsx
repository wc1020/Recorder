"use client";

import {
  Children,
  createContext,
  isValidElement,
  useContext,
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

const GameFilterContext = createContext<{
  q: string;
  update: (next: string) => void;
} | null>(null);

export function GameFilterProvider({
  storageKey,
  children,
}: {
  storageKey: string;
  children: ReactNode;
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

  return (
    <GameFilterContext.Provider value={{ q, update }}>
      {children}
    </GameFilterContext.Provider>
  );
}

function useGameFilter() {
  const ctx = useContext(GameFilterContext);
  if (!ctx) throw new Error("GameFilterProvider missing");
  return ctx;
}

export function GameFilterInput() {
  const { q, update } = useGameFilter();
  return (
    <form className="search-form game-filter-inline" onSubmit={(e) => e.preventDefault()}>
      <input
        type="search"
        value={q}
        onChange={(e) => update(e.target.value)}
        placeholder="搜索当前列表"
        aria-label="搜索当前列表"
      />
    </form>
  );
}

export function GameTabSearch({
  children,
  emptyFilter = "没有匹配的游戏。",
}: {
  children: ReactNode;
  emptyFilter?: string;
}) {
  const { q } = useGameFilter();
  const needle = q.trim().toLowerCase();
  const items = Children.toArray(children).filter(isValidElement);
  const shown = needle
    ? items.filter((child) => dataName(child).includes(needle))
    : items;

  if (shown.length === 0) return <p className="empty">{emptyFilter}</p>;
  return <div className="grid">{shown}</div>;
}
