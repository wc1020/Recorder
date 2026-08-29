export function gamePageHref(view: string, live = false): string {
  const sp = new URLSearchParams();
  sp.set("type", "game");
  if (view && view !== "recent") sp.set("view", view);
  if (live) sp.set("live", "1");
  return `/?${sp.toString()}`;
}
