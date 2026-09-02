import type { ItemSnapshot, Provider, SearchHit } from "./types";
import { ProviderNotConfiguredError, requireEnv } from "./types";
import { loadLocalEnv } from "@/lib/load-local-env";
import {
  loadSteamBackup,
  saveSteamGameBackup,
  saveSteamPerfectBackup,
  saveSteamPlayerBackup,
  saveSteamProfileBackup,
} from "@/lib/steam-cache";

export { formatHours, formatPlaytime, formatYuan } from "@/lib/steam-format";

type SteamItem = {
  appid?: number;
  name?: string;
  type?: number;
  is_free?: boolean;
  assets?: {
    asset_url_format?: string;
    header?: string;
    library_capsule?: string;
    small_capsule?: string;
    hero_capsule?: string;
    main_capsule?: string;
  };
  basic_info?: {
    short_description?: string;
    developers?: { name?: string }[];
  };
  release?: { steam_release_date?: number };
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
  best_purchase_option?: {
    formatted_final_price?: string;
    formatted_original_price?: string;
    final_price_in_cents?: string | number;
    original_price_in_cents?: string | number;
  };
  reviews?: {
    summary_filtered?: {
      review_count?: number;
      percent_positive?: number;
      review_score_label?: string;
    };
  };
  related_items?: { parent_appid?: number };
  user_filter_failure?: { already_owned?: boolean };
};

type SteamListResponse = {
  response?: {
    store_items?: SteamItem[];
    dlc_lists?: { parent_appid?: number; dlc_appids?: number[] }[];
  };
};

export type SteamProfile = {
  name: string;
  profileUrl: string;
  avatarUrl: string | null;
  miniBackgroundUrl: string | null;
  miniBackgroundMovieUrl: string | null;
  presence: "offline" | "online" | "ingame";
  playingName: string | null;
};

export type SteamXp = {
  level: number;
  xp: number;
  xpToNext: number;
  xpCurrentLevel: number;
};

export type SteamDlcPrice = {
  appid: number;
  originalFen: number | null;
  owned: boolean;
};

export type SteamDlcRow = {
  appid: number;
  name: string;
  coverUrl: string | null;
  originalFen: number | null;
  owned: boolean;
  storeUrl: string;
};

export type SteamGameRow = {
  appid: number;
  name: string;
  coverUrl: string | null;
  playtimeForeverMin: number;
  playtime2WeeksMin: number;
  price: string | null;
  originalFen: number | null;
  dlcPrices?: SteamDlcPrice[];
  achUnlocked: number | null;
  achTotal: number | null;
};

export type SteamPlayerPage = {
  profile: SteamProfile;
  xp: SteamXp | null;
  totalPlaytimeMin: number;
  familyRecentPlaytimeMin: number;
  familyPlaytimeMin: number;
  familyError: string | null;
  recentlyPlayed: SteamGameRow[];
  owned: SteamGameRow[];
  family: SteamGameRow[];
  privateAppIds: number[];
  fromCache: boolean;
  cachedAt: string | null;
  cacheReason: "offline" | "tab" | null;
};

function apiKey(): string {
  return requireEnv("STEAM_API_KEY");
}

function coverUrl(assets: SteamItem["assets"] | undefined): string | null {
  if (!assets?.asset_url_format) return null;
  const file =
    assets.library_capsule ||
    assets.hero_capsule ||
    assets.header ||
    assets.main_capsule ||
    assets.small_capsule;
  if (!file) return null;
  return `https://shared.akamai.steamstatic.com/store_item_assets/${assets.asset_url_format.replace(
    "${FILENAME}",
    file,
  )}`;
}

function storeCapsule(appid: number): string {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header_schinese.jpg`;
}

function yearFromUnix(seconds: number | undefined): number | null {
  if (!seconds) return null;
  const year = new Date(seconds * 1000).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

function platformLabel(platforms: SteamItem["platforms"] | undefined): string | null {
  if (!platforms) return null;
  const names = [
    platforms.windows ? "Windows" : "",
    platforms.mac ? "Mac" : "",
    platforms.linux ? "Linux" : "",
  ].filter(Boolean);
  return names.length ? names.join(" / ") : null;
}

function centsToFen(raw: string | number | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function originalFenOf(item: SteamItem): number | null {
  if (item.is_free) return 0;
  const opt = item.best_purchase_option;
  if (!opt) return null;
  return centsToFen(opt.original_price_in_cents) ?? centsToFen(opt.final_price_in_cents);
}

function addFen(base: number | null | undefined, extra: number | undefined): number | null {
  if (extra == null || extra === 0) return base ?? null;
  if (base == null) return extra;
  return base + extra;
}

function priceLabel(item: SteamItem): string | null {
  if (item.is_free) return "免费";
  return item.best_purchase_option?.formatted_final_price || null;
}

const CONTEXT = { language: "schinese", country_code: "CN", steam_realm: 1 };
const DATA_REQUEST = {
  include_assets: true,
  include_basic_info: true,
  include_release: true,
  include_platforms: true,
};
const STORE_REQUEST = {
  ...DATA_REQUEST,
  include_all_purchase_options: true,
};
const OWNED_DLC_REQUEST = {
  ...STORE_REQUEST,
  apply_user_filters: true,
};
const DETAIL_REQUEST = {
  ...STORE_REQUEST,
  include_reviews: true,
};

/** 库存游戏的 DLC：名单用 Solr，是否已购用登录 token 的 already_owned。 */
async function fetchDlcByParent(
  steamid: string,
  ownedAppids: number[],
): Promise<Map<number, SteamDlcPrice[]>> {
  const extra = new Map<number, SteamDlcPrice[]>();
  const ownedSet = new Set(ownedAppids.filter((id) => id > 0));
  if (ownedSet.size === 0) return extra;

  const parentByDlc = new Map<number, number>();
  const uniqueOwned = [...ownedSet];
  for (let i = 0; i < uniqueOwned.length; i += 40) {
    const chunk = uniqueOwned.slice(i, i + 40);
    try {
      const data = await steamWebGet("IStoreBrowseService/GetDLCForAppsSolr/v1/", {
        context: CONTEXT,
        appids: chunk,
        count: 200,
      });
      for (const list of data.response?.dlc_lists ?? []) {
        const parent = list.parent_appid;
        if (!parent || !ownedSet.has(parent)) continue;
        for (const dlcId of list.dlc_appids ?? []) {
          if (dlcId > 0) parentByDlc.set(dlcId, parent);
        }
      }
    } catch {
      // 这一批 DLC 名单失败就跳过
    }
  }
  if (parentByDlc.size === 0) return extra;

  const auth = await getFamilyAccessToken(steamid);
  const dlcIds = [...parentByDlc.keys()];
  const seen = new Set<number>();
  for (let i = 0; i < dlcIds.length; i += 40) {
    const chunk = dlcIds.slice(i, i + 40);
    try {
      const data = auth.token
        ? ((await steamAccessJson("IStoreBrowseService/GetItems/v1/", auth.token, {
            ids: chunk.map((appid) => ({ appid })),
            context: CONTEXT,
            data_request: OWNED_DLC_REQUEST,
          })) as SteamListResponse)
        : await steamWebGet("IStoreBrowseService/GetItems/v1/", {
            ids: chunk.map((appid) => ({ appid })),
            context: CONTEXT,
            data_request: STORE_REQUEST,
          });
      for (const item of data.response?.store_items ?? []) {
        if (!item.appid) continue;
        const parent = item.related_items?.parent_appid ?? parentByDlc.get(item.appid);
        if (!parent || !ownedSet.has(parent)) continue;
        seen.add(item.appid);
        const row: SteamDlcPrice = {
          appid: item.appid,
          originalFen: originalFenOf(item),
          owned: Boolean(item.user_filter_failure?.already_owned),
        };
        const list = extra.get(parent) ?? [];
        list.push(row);
        extra.set(parent, list);
      }
    } catch {
      // 这一批失败就跳过
    }
  }
  for (const [dlcId, parent] of parentByDlc) {
    if (seen.has(dlcId)) continue;
    const list = extra.get(parent) ?? [];
    list.push({ appid: dlcId, originalFen: null, owned: false });
    extra.set(parent, list);
  }
  return extra;
}

function ownedDlcFenSum(dlc: SteamDlcPrice[] | undefined): number | undefined {
  if (!dlc || dlc.length === 0) return undefined;
  let sum = 0;
  let any = false;
  for (const row of dlc) {
    if (!row.owned || row.originalFen == null || row.originalFen <= 0) continue;
    sum += row.originalFen;
    any = true;
  }
  return any ? sum : undefined;
}

async function fetchGameDlcList(
  steamid: string,
  parentAppid: number,
): Promise<{ items: SteamDlcRow[]; error: string | null }> {
  try {
    const data = await steamWebGet("IStoreBrowseService/GetDLCForAppsSolr/v1/", {
      context: CONTEXT,
      appids: [parentAppid],
      count: 200,
    });
    const ids = [
      ...new Set(
        (data.response?.dlc_lists ?? [])
          .filter((list) => list.parent_appid === parentAppid)
          .flatMap((list) => list.dlc_appids ?? []),
      ),
    ].filter((id) => id > 0);
    if (ids.length === 0) return { items: [], error: null };

    const auth = await getFamilyAccessToken(steamid);
    const items: SteamDlcRow[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      const raw = auth.token
        ? ((await steamAccessJson("IStoreBrowseService/GetItems/v1/", auth.token, {
            ids: chunk.map((appid) => ({ appid })),
            context: CONTEXT,
            data_request: OWNED_DLC_REQUEST,
          })) as SteamListResponse)
        : await steamWebGet("IStoreBrowseService/GetItems/v1/", {
            ids: chunk.map((appid) => ({ appid })),
            context: CONTEXT,
            data_request: STORE_REQUEST,
          });
      for (const item of raw.response?.store_items ?? []) {
        if (!item.appid || seen.has(item.appid)) continue;
        seen.add(item.appid);
        items.push({
          appid: item.appid,
          name: item.name || `App ${item.appid}`,
          coverUrl: coverUrl(item.assets) || storeCapsule(item.appid),
          originalFen: originalFenOf(item),
          owned: Boolean(item.user_filter_failure?.already_owned),
          storeUrl: `https://store.steampowered.com/app/${item.appid}`,
        });
      }
    }
    for (const id of ids) {
      if (seen.has(id)) continue;
      items.push({
        appid: id,
        name: `App ${id}`,
        coverUrl: storeCapsule(id),
        originalFen: null,
        owned: false,
        storeUrl: `https://store.steampowered.com/app/${id}`,
      });
    }
    items.sort((a, b) => {
      if (a.owned !== b.owned) return a.owned ? -1 : 1;
      return a.name.localeCompare(b.name, "zh");
    });
    return {
      items,
      error: auth.token ? null : "没有登录 token，无法判断哪些 DLC 已购买。",
    };
  } catch {
    return { items: [], error: "DLC 列表读取失败。" };
  }
}

const REVIEW_LABEL_ZH: Record<string, string> = {
  "Overwhelmingly Positive": "好评如潮",
  "Very Positive": "特别好评",
  "Positive": "好评",
  "Mostly Positive": "多半好评",
  "Mixed": "褒贬不一",
  "Mostly Negative": "多半差评",
  "Negative": "差评",
  "Very Negative": "特别差评",
  "Overwhelmingly Negative": "差评如潮",
};

export type SteamReviewSummary = {
  label: string;
  percent: number | null;
  total: number;
};

export type SteamAchievement = {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  unlocked: boolean;
  unlockTime: number | null;
  percent: number | null;
};

export type SteamGamePage = {
  appid: number;
  name: string;
  coverUrl: string | null;
  description: string | null;
  price: string | null;
  originalFen: number | null;
  fromOwned: boolean;
  fromFamily: boolean;
  playtimeForeverMin: number;
  playtime2WeeksMin: number;
  storeUrl: string;
  review: SteamReviewSummary | null;
  dlc: SteamDlcRow[];
  dlcError: string | null;
  achievements: SteamAchievement[] | null;
  achievementError: string | null;
};

async function steamFetch(url: URL): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error("连不上 Steam，请检查网络");
  }
  if (res.status === 403) {
    throw new Error("Steam Web API Key 无效");
  }
  if (!res.ok) {
    throw new Error(`Steam 请求失败（${res.status}）`);
  }
  return res;
}

async function steamWebGet(path: string, input: object): Promise<SteamListResponse> {
  const url = new URL(`https://api.steampowered.com/${path}`);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("input_json", JSON.stringify(input));
  const res = await steamFetch(url);
  return (await res.json()) as SteamListResponse;
}

async function steamAccessPost(path: string, accessToken: string, input: object): Promise<unknown> {
  const url = new URL(`https://api.steampowered.com/${path}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("input_json", JSON.stringify(input));
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", cache: "no-store" });
  } catch {
    throw new Error("连不上 Steam，请检查网络");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("家庭库 token 无效或已过期");
  }
  if (!res.ok) {
    throw new Error(`Steam 请求失败（${res.status}）`);
  }
  return res.json();
}

type AchProgress = { unlocked: number; total: number };

async function fetchAchievementProgress(
  steamid: string,
  appids: number[],
): Promise<Map<number, AchProgress>> {
  const unique = [...new Set(appids)].filter((id) => id > 0);
  if (unique.length === 0) return new Map();
  return fetchAchievementProgressByKey(steamid, unique);
}

async function fetchAchievementProgressByKey(
  steamid: string,
  appids: number[],
): Promise<Map<number, AchProgress>> {
  const out = new Map<number, AchProgress>();
  const queue = appids.slice();
  const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
    while (queue.length) {
      const appid = queue.shift();
      if (!appid) return;
      try {
        const raw = (await steamQuery("ISteamUserStats/GetPlayerAchievements/v1/", {
          steamid,
          appid: String(appid),
        })) as {
          playerstats?: {
            success?: boolean;
            achievements?: { achieved?: number }[];
          };
        };
        const list = raw.playerstats?.success ? raw.playerstats.achievements : null;
        if (!list) {
          out.set(appid, { unlocked: 0, total: 0 });
          continue;
        }
        out.set(appid, {
          unlocked: list.filter((a) => a.achieved === 1).length,
          total: list.length,
        });
      } catch {
        // 单游戏失败就跳过，卡片显示 —
      }
    }
  });
  await Promise.all(workers);
  return out;
}

function withProgress(
  game: SteamGameRow,
  progress: Map<number, AchProgress>,
): SteamGameRow {
  const p = progress.get(game.appid);
  return {
    ...game,
    achUnlocked: p?.unlocked ?? null,
    achTotal: p?.total ?? null,
  };
}

function omitPrivateGames<T extends { appid: number }>(
  games: T[],
  privateIds: Set<number>,
): T[] {
  if (privateIds.size === 0) return games;
  return games.filter((g) => !privateIds.has(g.appid));
}

function omitOwnedFromFamily<T extends { appid: number }>(
  family: T[],
  owned: { appid: number }[],
): T[] {
  if (owned.length === 0) return family;
  const ownedIds = new Set(owned.map((g) => g.appid));
  return family.filter((g) => !ownedIds.has(g.appid));
}

function parsePrivateAppIds(raw: unknown): Set<number> {
  const ids = new Set<number>();
  const add = (value: unknown) => {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) ids.add(n);
  };
  const block = (raw as { response?: { private_apps?: unknown } })?.response?.private_apps;
  if (!block) return ids;
  if (Array.isArray(block)) {
    for (const row of block) {
      if (typeof row === "number" || typeof row === "string") add(row);
      else if (row && typeof row === "object") {
        const obj = row as { appid?: unknown; appids?: unknown };
        add(obj.appid);
        if (Array.isArray(obj.appids)) obj.appids.forEach(add);
      }
    }
    return ids;
  }
  if (typeof block === "object") {
    const appids = (block as { appids?: unknown }).appids;
    if (Array.isArray(appids)) appids.forEach(add);
  }
  return ids;
}

async function lastPrivateAppIds(): Promise<Set<number>> {
  const backup = await loadSteamBackup();
  return new Set(backup?.player?.privateAppIds ?? []);
}

async function fetchPrivateAppIds(steamid: string): Promise<Set<number>> {
  const auth = await getFamilyAccessToken(steamid);
  if (!auth.token) return lastPrivateAppIds();
  try {
    const data = await steamAccessGet(
      "IAccountPrivateAppsService/GetPrivateAppList/v1/",
      auth.token,
      {},
    );
    return parsePrivateAppIds(data);
  } catch {
    return lastPrivateAppIds();
  }
}

async function steamQuery(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`https://api.steampowered.com/${path}`);
  url.searchParams.set("key", apiKey());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await steamFetch(url);
  return res.json();
}

function communityImageUrl(file: string | undefined): string | null {
  if (!file) return null;
  if (/^https?:\/\//i.test(file)) return file;
  return `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/${file.replace(/^\//, "")}`;
}

type EquippedCosmetic = {
  image_small?: string;
  image_large?: string;
  movie_webm?: string;
  movie_mp4?: string;
};

async function fetchSteamXp(steamid: string): Promise<SteamXp | null> {
  try {
    const raw = await steamQuery("IPlayerService/GetBadges/v1/", { steamid });
    const r = (
      raw as {
        response?: {
          player_xp?: number;
          player_level?: number;
          player_xp_needed_to_level_up?: number;
          player_xp_needed_current_level?: number;
        };
      }
    ).response;
    if (r?.player_level == null) return null;
    return {
      level: r.player_level,
      xp: r.player_xp ?? 0,
      xpToNext: r.player_xp_needed_to_level_up ?? 0,
      xpCurrentLevel: r.player_xp_needed_current_level ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchMiniProfileBackground(steamid: string): Promise<{
  imageUrl: string | null;
  movieUrl: string | null;
}> {
  try {
    const raw = await steamQuery("IPlayerService/GetProfileItemsEquipped/v1/", { steamid });
    const item = (
      raw as { response?: { mini_profile_background?: EquippedCosmetic } }
    ).response?.mini_profile_background;
    if (!item) return { imageUrl: null, movieUrl: null };
    const apng = [item.image_small, item.image_large].find((f) => f && /\.apng$/i.test(f));
    return {
      imageUrl: communityImageUrl(apng || item.image_large || item.image_small),
      movieUrl: communityImageUrl(item.movie_webm || item.movie_mp4),
    };
  } catch {
    return { imageUrl: null, movieUrl: null };
  }
}

function toHit(item: SteamItem): SearchHit | null {
  if (!item.appid || !item.name) return null;
  return {
    sourceId: String(item.appid),
    title: item.name,
    year: yearFromUnix(item.release?.steam_release_date),
    coverUrl: coverUrl(item.assets),
    subtitle: platformLabel(item.platforms),
  };
}

type FamilyAuth = { token: string | null; error: string | null };

type SharedApp = {
  appid?: number;
  name?: string;
  img_icon_hash?: string;
  exclude_reason?: number;
  rt_playtime?: number;
  app_type?: number;
};

type PlaytimeEntry = {
  steamid?: string;
  appid?: number;
  seconds_played?: number;
};

let cachedFamilyAccess: { token: string; exp: number; source: string } | null = null;

function normalizeSteamToken(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as { webapi_token?: string; access_token?: string };
      return json.webapi_token || json.access_token || "";
    } catch {
      return "";
    }
  }
  const decoded = decodeURIComponent(trimmed);
  const parts = decoded.split("||");
  return (parts[parts.length - 1] || "").trim();
}

function jwtExp(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

function tokenStillGood(token: string): boolean {
  const exp = jwtExp(token);
  if (exp == null) return true;
  return exp > Math.floor(Date.now() / 1000) + 120;
}

async function steamAccessJson(
  path: string,
  accessToken: string,
  input: object,
): Promise<unknown> {
  const url = new URL(`https://api.steampowered.com/${path}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("input_json", JSON.stringify(input));
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error("连不上 Steam，请检查网络");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("家庭库 token 无效或已过期");
  }
  if (!res.ok) {
    throw new Error(`Steam 请求失败（${res.status}）`);
  }
  return res.json();
}

async function steamAccessGet(
  path: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`https://api.steampowered.com/${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error("连不上 Steam，请检查网络");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("家庭库 token 无效或已过期");
  }
  if (!res.ok) {
    throw new Error(`Steam 请求失败（${res.status}）`);
  }
  return res.json();
}

async function refreshAccessToken(refreshToken: string, steamid: string): Promise<string> {
  const url = new URL("https://api.steampowered.com/IAuthenticationService/GenerateAccessTokenForApp/v1/");
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    steamid,
  });
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
  } catch {
    throw new Error("连不上 Steam，请检查网络");
  }
  if (!res.ok) {
    throw new Error("STEAM_REFRESH_TOKEN 无法换出新 token（无效或已撤销）");
  }
  const data = (await res.json()) as { response?: { access_token?: string } };
  const token = data.response?.access_token;
  if (!token) {
    throw new Error("STEAM_REFRESH_TOKEN 换 token 失败。商店页的 webapi_token 请放到 STEAM_ACCESS_TOKEN。");
  }
  return token;
}

async function getFamilyAccessToken(steamid: string): Promise<FamilyAuth> {
  loadLocalEnv({ reload: true });
  const access = normalizeSteamToken(process.env.STEAM_ACCESS_TOKEN);
  const refresh = normalizeSteamToken(process.env.STEAM_REFRESH_TOKEN);
  if (!access && !refresh) return { token: null, error: null };

  const source = `${access}\n${refresh}`;
  if (
    cachedFamilyAccess &&
    cachedFamilyAccess.source === source &&
    tokenStillGood(cachedFamilyAccess.token)
  ) {
    return { token: cachedFamilyAccess.token, error: null };
  }

  if (refresh) {
    try {
      const token = await refreshAccessToken(refresh, steamid);
      cachedFamilyAccess = { token, exp: jwtExp(token) ?? 0, source };
      return { token, error: null };
    } catch (err) {
      if (access && tokenStillGood(access)) {
        cachedFamilyAccess = { token: access, exp: jwtExp(access) ?? 0, source };
        return { token: access, error: null };
      }
      return {
        token: null,
        error: err instanceof Error ? err.message : "刷新 Steam token 失败",
      };
    }
  }

  if (!tokenStillGood(access)) {
    return { token: null, error: null };
  }
  return { token: access, error: null };
}

async function fetchFamilyLibrary(
  steamid: string,
  withCovers = true,
): Promise<{
  games: SteamGameRow[];
  playtimeMin: number;
  error: string | null;
}> {
  const auth = await getFamilyAccessToken(steamid);
  if (auth.error) return { games: [], playtimeMin: 0, error: auth.error };
  if (!auth.token) return { games: [], playtimeMin: 0, error: null };

  try {
    const groupRaw = (await steamAccessGet(
      "IFamilyGroupsService/GetFamilyGroupForUser/v1/",
      auth.token,
      { include_family_group_response: "0" },
    )) as {
      response?: { family_groupid?: string | number; is_not_member_of_any_group?: boolean };
    };
    const groupId = String(groupRaw.response?.family_groupid ?? "");
    if (!groupId || groupId === "0" || groupRaw.response?.is_not_member_of_any_group) {
      return { games: [], playtimeMin: 0, error: "这个账号不在 Steam 家庭组里。" };
    }

    const [appsRaw, playRaw] = await Promise.all([
      steamAccessGet("IFamilyGroupsService/GetSharedLibraryApps/v1/", auth.token, {
        family_groupid: groupId,
        include_own: "false",
        language: "schinese",
      }),
      steamAccessGet("IFamilyGroupsService/GetPlaytimeSummary/v1/", auth.token, {
        family_groupid: groupId,
      }).catch(() => null),
    ]);

    const apps = (
      (appsRaw as { response?: { apps?: SharedApp[] } }).response?.apps ?? []
    ).filter((app) => app.appid && (app.exclude_reason ?? 0) === 0);

    const minutesByApp = new Map<number, number>();
    const entries =
      (playRaw as { response?: { entries?: PlaytimeEntry[] } } | null)?.response?.entries ?? [];
    for (const row of entries) {
      if (!row.appid || String(row.steamid) !== steamid) continue;
      const min = Math.round((row.seconds_played ?? 0) / 60);
      minutesByApp.set(row.appid, Math.max(minutesByApp.get(row.appid) ?? 0, min));
    }

    const extras = withCovers
      ? await fetchStoreExtras(apps.map((app) => app.appid!))
      : new Map<number, StoreExtra>();
    const games = apps.map((app) => {
      const appid = app.appid!;
      const extra = extras.get(appid);
      const playtimeForeverMin = Math.max(
        minutesByApp.get(appid) ?? 0,
        app.rt_playtime ?? 0,
      );
      return {
        appid,
        name: app.name || `App ${appid}`,
        coverUrl: extra?.coverUrl || storeCapsule(appid),
        playtimeForeverMin,
        playtime2WeeksMin: 0,
        price: extra?.price ?? null,
        originalFen: extra?.originalFen ?? null,
        achUnlocked: null,
        achTotal: null,
      } satisfies SteamGameRow;
    });
    games.sort((a, b) => b.playtimeForeverMin - a.playtimeForeverMin);
    const playtimeMin = games.reduce((sum, g) => sum + g.playtimeForeverMin, 0);
    return { games, playtimeMin, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取家庭库失败";
    const error =
      message.includes("403") || message.includes("401") || /Steam Web API Key 无效/.test(message)
        ? "家庭库 token 无效或已过期，请更新 STEAM_ACCESS_TOKEN / STEAM_REFRESH_TOKEN。"
        : message;
    return { games: [], playtimeMin: 0, error };
  }
}

async function resolveSteamId(): Promise<string> {
  const raw = process.env.STEAM_STEAMID?.trim();
  if (!raw) {
    throw new ProviderNotConfiguredError("未配置：请在 local/.env 中设置 STEAM_STEAMID");
  }
  if (/^\d{17}$/.test(raw)) return raw;
  const data = (await steamQuery("ISteamUser/ResolveVanityURL/v1/", {
    vanityurl: raw,
  })) as { response?: { success?: number; steamid?: string } };
  const id = data.response?.steamid;
  if (data.response?.success !== 1 || !id) {
    throw new Error("STEAM_STEAMID 无效（填 17 位 SteamID64，或公开自定义主页名）");
  }
  return id;
}

type OwnedGame = {
  appid: number;
  name?: string;
  playtime_forever?: number;
  playtime_2weeks?: number;
  img_icon_url?: string;
};

type StoreExtra = {
  coverUrl: string | null;
  price: string | null;
  originalFen: number | null;
  name: string | null;
};

async function fetchStoreExtras(appids: number[]): Promise<Map<number, StoreExtra>> {
  const extras = new Map<number, StoreExtra>();
  const unique = [...new Set(appids)].filter((id) => id > 0);
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    try {
      const data = await steamWebGet("IStoreBrowseService/GetItems/v1/", {
        ids: chunk.map((appid) => ({ appid })),
        context: CONTEXT,
        data_request: STORE_REQUEST,
      });
      for (const item of data.response?.store_items ?? []) {
        if (!item.appid) continue;
        extras.set(item.appid, {
          coverUrl: coverUrl(item.assets),
          price: priceLabel(item),
          originalFen: originalFenOf(item),
          name: item.name?.trim() || null,
        });
      }
    } catch {
      // 现价/封面补全失败时仍显示库存本身
    }
  }
  return extras;
}

export function mergePlayedGames(
  owned: SteamGameRow[],
  recent: SteamGameRow[],
): SteamGameRow[] {
  return mergeLibraryGames(owned, recent).filter(
    (game) => game.playtimeForeverMin > 0 || game.playtime2WeeksMin > 0,
  );
}

export function mergeLibraryGames(...lists: SteamGameRow[][]): SteamGameRow[] {
  const map = new Map<number, SteamGameRow>();
  for (const list of lists) {
    for (const game of list) {
      const prev = map.get(game.appid);
      if (!prev || game.playtimeForeverMin > prev.playtimeForeverMin) {
        map.set(game.appid, game);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.playtimeForeverMin - a.playtimeForeverMin);
}

let perfectCache: {
  key: string;
  items: { appid: number; completedAt: number }[];
  at: number;
} | null = null;

function playedKey(games: SteamGameRow[]): string {
  return games
    .map((g) => g.appid)
    .sort((a, b) => a - b)
    .join(",");
}

function isProgressPerfect(game: SteamGameRow): boolean {
  return (
    game.achTotal != null &&
    game.achTotal > 0 &&
    game.achUnlocked === game.achTotal
  );
}

function hasAchievementProgress(games: SteamGameRow[]): boolean {
  return games.some((g) => g.achTotal != null);
}

function sortPerfect(
  games: SteamGameRow[],
  completedAt: Map<number, number>,
): SteamGameRow[] {
  return games.slice().sort((a, b) => {
    const tb = completedAt.get(b.appid) ?? 0;
    const ta = completedAt.get(a.appid) ?? 0;
    if (tb !== ta) return tb - ta;
    return b.playtimeForeverMin - a.playtimeForeverMin;
  });
}

export function cachedPerfectCount(played: SteamGameRow[]): number | null {
  if (hasAchievementProgress(played)) {
    return played.filter(isProgressPerfect).length;
  }
  if (!perfectCache || perfectCache.key !== playedKey(played)) return null;
  return perfectCache.items.length;
}

function finishPerfectList(
  games: SteamGameRow[],
  key: string,
  completedAt: Map<number, number>,
): SteamGameRow[] {
  const results = sortPerfect(games, completedAt);
  perfectCache = {
    key,
    items: results.map((g) => ({
      appid: g.appid,
      completedAt: completedAt.get(g.appid) ?? 0,
    })),
    at: Date.now(),
  };
  return results;
}

export async function filterPerfectGames(
  games: SteamGameRow[],
  opts?: { fromCache?: boolean },
): Promise<SteamGameRow[]> {
  const unique = mergeLibraryGames(games);
  const byId = new Map(unique.map((g) => [g.appid, g]));
  const key = playedKey(unique);
  const fromProgress = unique.filter(isProgressPerfect);

  if (hasAchievementProgress(unique)) {
    const backup = opts?.fromCache ? await loadSteamBackup() : null;
    const completedAt = new Map(
      (backup?.perfect ?? perfectCache?.items ?? []).map((i) => [i.appid, i.completedAt]),
    );
    if (opts?.fromCache) {
      return finishPerfectList(fromProgress, key, completedAt);
    }
    if (
      perfectCache &&
      perfectCache.key === key &&
      Date.now() - perfectCache.at < 15 * 60 * 1000 &&
      fromProgress.every((g) => perfectCache?.items.some((i) => i.appid === g.appid))
    ) {
      return finishPerfectList(fromProgress, key, completedAt);
    }
    try {
      const steamid = await resolveSteamId();
      const queue = fromProgress.slice();
      const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
        while (queue.length) {
          const game = queue.shift();
          if (!game) return;
          const at = await perfectCompletedAt(steamid, game.appid);
          if (at != null) completedAt.set(game.appid, at);
        }
      });
      await Promise.all(workers);
      const results = finishPerfectList(fromProgress, key, completedAt);
      await saveSteamPerfectBackup(perfectCache?.items ?? []).catch(() => {});
      return results;
    } catch (err) {
      if (fromProgress.length > 0) return finishPerfectList(fromProgress, key, completedAt);
      throw err;
    }
  }

  if (opts?.fromCache) {
    return perfectFromBackup(byId, key);
  }
  if (
    perfectCache &&
    perfectCache.key === key &&
    Date.now() - perfectCache.at < 15 * 60 * 1000
  ) {
    const completedAt = new Map(perfectCache.items.map((i) => [i.appid, i.completedAt]));
    return sortPerfect(
      perfectCache.items
        .map((i) => byId.get(i.appid))
        .filter((g): g is SteamGameRow => Boolean(g)),
      completedAt,
    );
  }
  try {
    const steamid = await resolveSteamId();
    const completedAt = new Map<number, number>();
    const queue = unique.slice();
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length) {
        const game = queue.shift();
        if (!game) return;
        const at = await perfectCompletedAt(steamid, game.appid);
        if (at != null) completedAt.set(game.appid, at);
      }
    });
    await Promise.all(workers);
    const results = finishPerfectList(
      unique.filter((g) => completedAt.has(g.appid)),
      key,
      completedAt,
    );
    await saveSteamPerfectBackup(perfectCache?.items ?? []).catch(() => {});
    return results;
  } catch (err) {
    const fallback = await perfectFromBackup(byId, key);
    if (fallback.length > 0) return fallback;
    const backup = await loadSteamBackup();
    if (backup?.perfect) return fallback;
    throw err;
  }
}

async function perfectFromBackup(
  byId: Map<number, SteamGameRow>,
  key: string,
): Promise<SteamGameRow[]> {
  const backup = await loadSteamBackup();
  if (!backup?.perfect) return [];
  perfectCache = { key, items: backup.perfect, at: Date.now() };
  const completedAt = new Map(backup.perfect.map((i) => [i.appid, i.completedAt]));
  return sortPerfect(
    backup.perfect
      .map((i) => byId.get(i.appid))
      .filter((g): g is SteamGameRow => Boolean(g)),
    completedAt,
  );
}

async function perfectCompletedAt(steamid: string, appid: number): Promise<number | null> {
  try {
    const playerRaw = await steamQuery("ISteamUserStats/GetPlayerAchievements/v1/", {
      steamid,
      appid: String(appid),
    });
    const stats = (
      playerRaw as {
        playerstats?: {
          success?: boolean;
          achievements?: { achieved?: number; unlocktime?: number }[];
        };
      }
    ).playerstats;
    const list = stats?.achievements;
    if (!stats?.success || !list?.length) return null;
    if (!list.every((a) => a.achieved === 1)) return null;
    return Math.max(...list.map((a) => a.unlocktime ?? 0));
  } catch (err) {
    if (err instanceof Error && err.message.includes("连不上 Steam")) throw err;
    return null;
  }
}

function playerFromBackup(
  backup: NonNullable<Awaited<ReturnType<typeof loadSteamBackup>>>,
  cacheReason: "offline" | "tab",
): SteamPlayerPage {
  const p = backup.player;
  const hidden = new Set(p.privateAppIds ?? []);
  const recentlyPlayed = omitPrivateGames(p.recentlyPlayed, hidden);
  const owned = omitPrivateGames(p.owned, hidden);
  const family = omitOwnedFromFamily(omitPrivateGames(p.family, hidden), owned);
  const library = mergeLibraryGames(owned, recentlyPlayed, family);
  const familyPlaytimeMin = family.reduce((sum, g) => sum + g.playtimeForeverMin, 0);
  const ownedPlaytimeMin = owned.reduce((sum, g) => sum + g.playtimeForeverMin, 0);
  if (backup.perfect) {
    perfectCache = {
      key: playedKey(library),
      items: backup.perfect,
      at: Date.now(),
    };
  }
  return {
    ...p,
    recentlyPlayed,
    owned,
    family,
    familyPlaytimeMin,
    familyError: p.familyError?.includes("STEAM_ACCESS_TOKEN 已过期")
      ? null
      : p.familyError,
    totalPlaytimeMin: ownedPlaytimeMin + familyPlaytimeMin + (p.familyRecentPlaytimeMin ?? 0),
    privateAppIds: [...hidden],
    xp: p.xp ?? null,
    fromCache: true,
    cachedAt: backup.savedAt,
    cacheReason,
  };
}

type SummaryPlayer = {
  personaname?: string;
  profileurl?: string;
  avatarfull?: string;
  personastate?: number;
  gameid?: string;
  gameextrainfo?: string;
};

function playingAppId(gameid?: string): number | null {
  const n = Number.parseInt(gameid ?? "", 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function profileFromSummary(
  steamid: string,
  player: SummaryPlayer & { personaname: string },
  miniBg: { imageUrl: string | null; movieUrl: string | null },
  playingName: string | null,
): SteamProfile {
  const name = playingName?.trim() || null;
  return {
    name: player.personaname,
    profileUrl: player.profileurl || `https://steamcommunity.com/profiles/${steamid}`,
    avatarUrl: player.avatarfull || null,
    miniBackgroundUrl: miniBg.imageUrl,
    miniBackgroundMovieUrl: miniBg.movieUrl,
    presence: name ? "ingame" : (player.personastate ?? 0) > 0 ? "online" : "offline",
    playingName: name,
  };
}

/** 只拉头像 / 在线状态 / 迷你背景，不碰库存列表。 */
export async function refreshSteamProfileLive(): Promise<void> {
  const backup = await loadSteamBackup();
  if (!backup) {
    throw new Error("还没有本地备份，请先用页面右侧刷新拉一次库存。");
  }
  const steamid = await resolveSteamId();
  const [summaryRaw, miniBg, xp] = await Promise.all([
    steamQuery("ISteamUser/GetPlayerSummaries/v2/", { steamids: steamid }),
    fetchMiniProfileBackground(steamid),
    fetchSteamXp(steamid),
  ]);
  const player = (
    summaryRaw as { response?: { players?: SummaryPlayer[] } }
  ).response?.players?.[0];
  if (!player?.personaname) {
    throw new Error("找不到公开资料。检查 STEAM_STEAMID，或把资料设为公开。");
  }
  const playingId = playingAppId(player.gameid);
  let playingName = player.gameextrainfo || null;
  if (playingId) {
    const hit = [
      ...backup.player.owned,
      ...backup.player.family,
      ...backup.player.recentlyPlayed,
    ].find((g) => g.appid === playingId);
    if (hit?.name) {
      playingName = hit.name;
    } else {
      const extras = await fetchStoreExtras([playingId]);
      playingName = extras.get(playingId)?.name || playingName;
    }
  }
  await saveSteamProfileBackup(profileFromSummary(steamid, player, miniBg, playingName), xp);
}

export async function getSteamPlayerPage(opts?: {
  live?: boolean;
}): Promise<SteamPlayerPage> {
  const backup = await loadSteamBackup();
  if (!opts?.live && backup) {
    return playerFromBackup(backup, "tab");
  }
  try {
    const data = await fetchSteamPlayerLive();
    await saveSteamPlayerBackup(data).catch(() => {});
    return data;
  } catch (err) {
    if (backup) return playerFromBackup(backup, "offline");
    throw err;
  }
}

async function fetchSteamPlayerLive(): Promise<SteamPlayerPage> {
  const steamid = await resolveSteamId();
  const [summaryRaw, ownedRaw, recentRaw, familyLib, privateIds, miniBg, xp] = await Promise.all([
    steamQuery("ISteamUser/GetPlayerSummaries/v2/", { steamids: steamid }),
    steamQuery("IPlayerService/GetOwnedGames/v1/", {
      steamid,
      include_appinfo: "1",
      include_played_free_games: "1",
      skip_unvetted_apps: "false",
    }),
    steamQuery("IPlayerService/GetRecentlyPlayedGames/v1/", {
      steamid,
      count: "50",
    }),
    fetchFamilyLibrary(steamid),
    fetchPrivateAppIds(steamid),
    fetchMiniProfileBackground(steamid),
    fetchSteamXp(steamid),
  ]);

  const player = (
    summaryRaw as { response?: { players?: SummaryPlayer[] } }
  ).response?.players?.[0];
  if (!player?.personaname) {
    throw new Error("找不到公开资料。检查 STEAM_STEAMID，或把资料设为公开。");
  }

  const ownedGames = omitPrivateGames(
    ((ownedRaw as { response?: { games?: OwnedGame[] } }).response?.games ?? []).slice(),
    privateIds,
  );
  ownedGames.sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));

  const recentGames = omitPrivateGames(
    (recentRaw as { response?: { games?: OwnedGame[] } }).response?.games ?? [],
    privateIds,
  );

  const ownedIds = new Set(ownedGames.map((g) => g.appid));
  const familySource = omitOwnedFromFamily(
    omitPrivateGames(familyLib.games, privateIds),
    ownedGames,
  );
  const playingId = playingAppId(player.gameid);

  const extraIds = [
    ...recentGames.map((g) => g.appid),
    ...ownedGames.map((g) => g.appid),
    ...familySource.map((g) => g.appid),
    ...(playingId ? [playingId] : []),
  ];
  const [extras, progress, dlcByParent] = await Promise.all([
    fetchStoreExtras(extraIds),
    fetchAchievementProgress(steamid, extraIds),
    fetchDlcByParent(steamid, [...ownedIds]),
  ]);

  const toRow = (g: OwnedGame): SteamGameRow => {
    const extra = extras.get(g.appid);
    const dlcPrices = ownedIds.has(g.appid) ? dlcByParent.get(g.appid) ?? [] : undefined;
    return withProgress(
      {
        appid: g.appid,
        name: extra?.name || g.name || `App ${g.appid}`,
        coverUrl: extra?.coverUrl || storeCapsule(g.appid),
        playtimeForeverMin: g.playtime_forever ?? 0,
        playtime2WeeksMin: g.playtime_2weeks ?? 0,
        price: extra?.price ?? null,
        originalFen: addFen(extra?.originalFen, ownedDlcFenSum(dlcPrices)),
        dlcPrices,
        achUnlocked: null,
        achTotal: null,
      },
      progress,
    );
  };

  const recentById = new Map(recentGames.map((g) => [g.appid, g]));
  const owned = ownedGames.map((g) => {
    const row = toRow(g);
    const recent = recentById.get(g.appid);
    if (!recent) return row;
    return {
      ...row,
      playtime2WeeksMin: Math.max(row.playtime2WeeksMin, recent.playtime_2weeks ?? 0),
      playtimeForeverMin: Math.max(row.playtimeForeverMin, recent.playtime_forever ?? 0),
    };
  });
  const family = familySource.map((g) => {
    const recent = recentById.get(g.appid);
    return withProgress(
      {
        ...g,
        playtime2WeeksMin: recent?.playtime_2weeks ?? 0,
        playtimeForeverMin: Math.max(g.playtimeForeverMin, recent?.playtime_forever ?? 0),
      },
      progress,
    );
  });
  const familyIds = new Set(family.map((g) => g.appid));
  const familyRecentPlaytimeMin = recentGames
    .filter((g) => !ownedIds.has(g.appid) && !familyIds.has(g.appid))
    .reduce((sum, g) => sum + (g.playtime_forever ?? 0), 0);
  const familyPlaytimeMin = family.reduce((sum, g) => sum + g.playtimeForeverMin, 0);
  const ownedPlaytimeMin = ownedGames.reduce((sum, g) => sum + (g.playtime_forever ?? 0), 0);

  return {
    profile: profileFromSummary(
      steamid,
      player,
      miniBg,
      (playingId ? extras.get(playingId)?.name : null) || player.gameextrainfo || null,
    ),
    xp,
    totalPlaytimeMin: ownedPlaytimeMin + familyPlaytimeMin + familyRecentPlaytimeMin,
    familyRecentPlaytimeMin,
    familyPlaytimeMin,
    familyError: familyLib.error,
    recentlyPlayed: recentGames.map(toRow),
    owned,
    family,
    privateAppIds: [...privateIds],
    fromCache: false,
    cachedAt: null,
    cacheReason: null,
  };
}

function reviewFromStore(item: SteamItem): SteamReviewSummary | null {
  const summary = item.reviews?.summary_filtered;
  if (!summary?.review_count) return null;
  const rawLabel = summary.review_score_label || "";
  return {
    label: REVIEW_LABEL_ZH[rawLabel] || rawLabel || "暂无评价",
    percent: summary.percent_positive ?? null,
    total: summary.review_count,
  };
}

async function reviewFromAppreviews(appid: number): Promise<SteamReviewSummary | null> {
  try {
    const url = new URL(`https://store.steampowered.com/appreviews/${appid}`);
    url.searchParams.set("json", "1");
    url.searchParams.set("language", "all");
    url.searchParams.set("purchase_type", "all");
    url.searchParams.set("num_per_page", "0");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query_summary?: {
        review_score_desc?: string;
        total_positive?: number;
        total_reviews?: number;
      };
    };
    const s = data.query_summary;
    if (!s?.total_reviews) return null;
    const raw = s.review_score_desc || "";
    const percent =
      s.total_positive != null
        ? Math.round((s.total_positive / s.total_reviews) * 100)
        : null;
    return {
      label: REVIEW_LABEL_ZH[raw] || raw || "暂无评价",
      percent,
      total: s.total_reviews,
    };
  } catch {
    return null;
  }
}

async function fetchAchievements(
  steamid: string,
  appid: number,
): Promise<{ items: SteamAchievement[] | null; error: string | null }> {
  let playerRaw: unknown;
  try {
    playerRaw = await steamQuery("ISteamUserStats/GetPlayerAchievements/v1/", {
      steamid,
      appid: String(appid),
      l: "schinese",
    });
  } catch {
    return { items: null, error: "拉不到成就。游戏可能没有 Steam 成就，或成就未公开。" };
  }
  const stats = (
    playerRaw as {
      playerstats?: {
        success?: boolean;
        error?: string;
        achievements?: { apiname?: string; achieved?: number; unlocktime?: number }[];
      };
    }
  ).playerstats;
  if (!stats?.success) {
    const err = stats?.error || "";
    if (/no stats/i.test(err)) {
      return { items: null, error: "此游戏没有 Steam 成就。" };
    }
    return { items: null, error: "成就未公开，或此游戏没有 Steam 成就。" };
  }
  const playerAch = stats.achievements ?? [];
  if (playerAch.length === 0) {
    return { items: null, error: "此游戏没有 Steam 成就。" };
  }

  let schemaRaw: unknown = null;
  let percents: Record<string, number> = {};
  try {
    schemaRaw = await steamQuery("ISteamUserStats/GetSchemaForGame/v2/", {
      appid: String(appid),
      l: "schinese",
    });
  } catch {
    schemaRaw = null;
  }
  try {
    const p = (await steamQuery("ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/", {
      gameid: String(appid),
    })) as {
      achievementpercentages?: { achievements?: { name?: string; percent?: number }[] };
    };
    for (const row of p.achievementpercentages?.achievements ?? []) {
      if (row.name) percents[row.name] = Number(row.percent ?? 0);
    }
  } catch {
    percents = {};
  }

  const schemaList =
    (
      schemaRaw as {
        game?: {
          availableGameStats?: {
            achievements?: {
              name?: string;
              displayName?: string;
              description?: string;
              icon?: string;
              icongray?: string;
              hidden?: number;
            }[];
          };
        };
      }
    ).game?.availableGameStats?.achievements ?? [];
  const schemaById = new Map(schemaList.map((a) => [a.name, a]));

  const items: SteamAchievement[] = playerAch
    .filter((a) => a.apiname)
    .map((a) => {
      const id = a.apiname!;
      const schema = schemaById.get(id);
      const unlocked = a.achieved === 1;
      const hidden = schema?.hidden === 1 && !unlocked;
      return {
        id,
        name: schema?.displayName || id,
        description: hidden ? null : schema?.description || null,
        iconUrl: (unlocked ? schema?.icon : schema?.icongray) || schema?.icon || null,
        unlocked,
        unlockTime: unlocked && a.unlocktime ? a.unlocktime : null,
        percent: percents[id] != null ? Number(percents[id]) : null,
      };
    });

  items.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return (b.unlockTime ?? 0) - (a.unlockTime ?? 0);
  });
  return { items, error: null };
}

export async function getSteamGamePage(
  appid: number,
  opts?: { live?: boolean },
): Promise<SteamGamePage> {
  if (!Number.isInteger(appid) || appid <= 0) {
    throw new Error("无效的 Steam App ID");
  }
  const backup = await loadSteamBackup();
  const cached = backup?.games?.[String(appid)];
  if (!opts?.live && cached) return cached;
  try {
    const data = await fetchSteamGameLive(appid);
    await saveSteamGameBackup(data).catch(() => {});
    return data;
  } catch (err) {
    if (cached) return cached;
    const fallback = await gamePageFromBackup(appid);
    if (fallback) return fallback;
    throw err;
  }
}

async function gamePageFromBackup(appid: number): Promise<SteamGamePage | null> {
  const backup = await loadSteamBackup();
  if (!backup) return null;
  const p = backup.player;
  const owned = p.owned.find((g) => g.appid === appid);
  const recent = p.recentlyPlayed.find((g) => g.appid === appid);
  const family = p.family.find((g) => g.appid === appid);
  const row = owned ?? recent ?? family;
  if (!row) return null;
  return {
    appid,
    name: row.name,
    coverUrl: row.coverUrl || storeCapsule(appid),
    description: null,
    price: row.price,
    originalFen: row.originalFen ?? null,
    fromOwned: Boolean(owned),
    fromFamily: Boolean(family) && !owned,
    playtimeForeverMin: row.playtimeForeverMin,
    playtime2WeeksMin: row.playtime2WeeksMin,
    storeUrl: `https://store.steampowered.com/app/${appid}`,
    review: null,
    dlc: [],
    dlcError: "当前是本地备份，DLC 列表需连上 Steam 后刷新。",
    achievements: null,
    achievementError: "当前是本地备份，成就和商店详情需连上 Steam 后刷新。",
  };
}

async function fetchSteamGameLive(appid: number): Promise<SteamGamePage> {
  const steamid = await resolveSteamId();
  const [storeData, reviewFallback, ownedRaw, recentRaw, familyLib, ach, dlc] = await Promise.all([
    steamWebGet("IStoreBrowseService/GetItems/v1/", {
      ids: [{ appid }],
      context: CONTEXT,
      data_request: DETAIL_REQUEST,
    }),
    reviewFromAppreviews(appid),
    steamQuery("IPlayerService/GetOwnedGames/v1/", {
      steamid,
      include_appinfo: "1",
      include_played_free_games: "1",
      skip_unvetted_apps: "false",
    }).catch(() => null),
    steamQuery("IPlayerService/GetRecentlyPlayedGames/v1/", {
      steamid,
      count: "50",
    }).catch(() => null),
    fetchFamilyLibrary(steamid, false),
    fetchAchievements(steamid, appid),
    fetchGameDlcList(steamid, appid),
  ]);

  const item = storeData.response?.store_items?.[0];
  const owned = (
    (ownedRaw as { response?: { games?: OwnedGame[] } } | null)?.response?.games ?? []
  ).find((g) => g.appid === appid);
  const recent = (
    (recentRaw as { response?: { games?: OwnedGame[] } } | null)?.response?.games ?? []
  ).find((g) => g.appid === appid);
  const family = familyLib.games.find((g) => g.appid === appid);
  const playedMin = Math.max(
    owned?.playtime_forever ?? 0,
    recent?.playtime_forever ?? 0,
    family?.playtimeForeverMin ?? 0,
  );
  const playedName = owned?.name || recent?.name || family?.name;
  const name = item?.name || playedName || `App ${appid}`;
  const baseFen = item ? originalFenOf(item) : family?.originalFen ?? null;
  const dlcFen = owned
    ? ownedDlcFenSum(
        dlc.items.map((row) => ({
          appid: row.appid,
          originalFen: row.originalFen,
          owned: row.owned,
        })),
      )
    : undefined;
  return {
    appid,
    name,
    coverUrl: coverUrl(item?.assets) || family?.coverUrl || storeCapsule(appid),
    description: item?.basic_info?.short_description?.trim() || null,
    price: item ? priceLabel(item) : family?.price || null,
    originalFen: addFen(baseFen, dlcFen),
    fromOwned: Boolean(owned),
    fromFamily: Boolean(family) && !owned,
    playtimeForeverMin: playedMin,
    playtime2WeeksMin: recent?.playtime_2weeks ?? 0,
    storeUrl: `https://store.steampowered.com/app/${appid}`,
    review: (item ? reviewFromStore(item) : null) || reviewFallback,
    dlc: dlc.items,
    dlcError: dlc.error,
    achievements: ach.items,
    achievementError: ach.error,
  };
}

export const steamProvider: Provider = {
  type: "game",
  source: "steam",

  async search(query: string): Promise<SearchHit[]> {
    const data = await steamWebGet("IStoreQueryService/SearchSuggestions/v1/", {
      search_term: query,
      max_results: 20,
      context: CONTEXT,
      filters: { type_filters: { include_apps: true, include_games: true } },
      data_request: DATA_REQUEST,
    });
    return (data.response?.store_items ?? [])
      .map(toHit)
      .filter((hit): hit is SearchHit => hit !== null);
  },

  async getDetail(sourceId: string): Promise<ItemSnapshot> {
    if (!/^\d+$/.test(sourceId)) {
      throw new Error("无效的 Steam App ID");
    }
    const data = await steamWebGet("IStoreBrowseService/GetItems/v1/", {
      ids: [{ appid: Number(sourceId) }],
      context: CONTEXT,
      data_request: STORE_REQUEST,
    });
    const item = data.response?.store_items?.[0];
    if (!item?.appid || !item.name) {
      throw new Error("Steam 未找到该游戏");
    }
    const developers = (item.basic_info?.developers ?? [])
      .map((d) => d.name)
      .filter((n): n is string => Boolean(n));
    return {
      type: "game",
      source: "steam",
      sourceId: String(item.appid),
      title: item.name,
      originalTitle: null,
      year: yearFromUnix(item.release?.steam_release_date),
      coverUrl: coverUrl(item.assets),
      description: item.basic_info?.short_description?.trim() || null,
      extraJson: developers.length ? JSON.stringify({ developers }) : null,
    };
  },
};
