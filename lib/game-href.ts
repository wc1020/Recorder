export const GAME_VIEWS = [
  { value: "recent", label: "最近游玩" },
  { value: "played", label: "全部游玩" },
  { value: "perfect", label: "完美通关" },
  { value: "owned", label: "库存游戏" },
  { value: "family", label: "家庭库" },
  { value: "want", label: "想玩" },
] as const;

export type GameView = (typeof GAME_VIEWS)[number]["value"];

export function parseGameView(value: string | undefined): GameView {
  return GAME_VIEWS.some((v) => v.value === value) ? (value as GameView) : "recent";
}

export function gamePageHref(view: string, live = false): string {
  const sp = new URLSearchParams();
  sp.set("type", "game");
  if (view && view !== "recent") sp.set("view", view);
  if (live) sp.set("live", "1");
  return `/?${sp.toString()}`;
}
