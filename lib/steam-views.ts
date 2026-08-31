import {
  mergeLibraryGames,
  type SteamGameRow,
} from "@/lib/providers/steam";

function omitPrivate(games: SteamGameRow[], hidden: Set<number>): SteamGameRow[] {
  if (hidden.size === 0) return games;
  return games.filter((g) => !hidden.has(g.appid));
}

function omitOwned(family: SteamGameRow[], owned: SteamGameRow[]): SteamGameRow[] {
  if (owned.length === 0) return family;
  const ids = new Set(owned.map((g) => g.appid));
  return family.filter((g) => !ids.has(g.appid));
}

function overlayRecent(
  library: SteamGameRow[],
  recent: SteamGameRow[],
): SteamGameRow[] {
  if (recent.length === 0) return library;
  const byId = new Map(recent.map((g) => [g.appid, g]));
  return library.map((g) => {
    const r = byId.get(g.appid);
    if (!r) return g;
    return {
      ...g,
      playtime2WeeksMin: Math.max(g.playtime2WeeksMin, r.playtime2WeeksMin),
      playtimeForeverMin: Math.max(g.playtimeForeverMin, r.playtimeForeverMin),
    };
  });
}

export type SteamGameViews = {
  recent: SteamGameRow[];
  played: SteamGameRow[];
  library: SteamGameRow[];
  owned: SteamGameRow[];
  family: SteamGameRow[];
};

/**
 * 游戏页标签（隐藏游戏全程排除）：
 * 1. 最近游玩：近两周有时长，且在账号库或家庭库，按近两周时长排
 * 2. 全部游玩：有时长，且在账号库或家庭库，按总时长排
 * 3. 完美通关：全成就，且在账号库或家庭库（调用方再筛），按完成时间排
 * 4. 库存游戏：账号库
 * 5. 家庭库：家庭库且不在账号库
 */
export function buildGameViews(data: {
  owned: SteamGameRow[];
  family: SteamGameRow[];
  recentlyPlayed: SteamGameRow[];
  privateAppIds?: number[];
}): SteamGameViews {
  const hidden = new Set(data.privateAppIds ?? []);
  const recentRaw = omitPrivate(data.recentlyPlayed, hidden);
  const owned = overlayRecent(omitPrivate(data.owned, hidden), recentRaw);
  const family = overlayRecent(
    omitOwned(omitPrivate(data.family, hidden), owned),
    recentRaw,
  );
  const library = mergeLibraryGames(owned, family);

  const recent = library
    .filter((g) => g.playtime2WeeksMin > 0)
    .sort(
      (a, b) =>
        b.playtime2WeeksMin - a.playtime2WeeksMin ||
        b.playtimeForeverMin - a.playtimeForeverMin,
    );

  const played = library
    .filter((g) => g.playtimeForeverMin > 0 || g.playtime2WeeksMin > 0)
    .sort((a, b) => b.playtimeForeverMin - a.playtimeForeverMin);

  return { recent, played, library, owned, family };
}
