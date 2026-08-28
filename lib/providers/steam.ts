import type { ItemSnapshot, Provider, SearchHit } from "./types";
import { requireEnv } from "./types";

type SteamItem = {
  appid?: number;
  name?: string;
  type?: number;
  assets?: {
    asset_url_format?: string;
    header?: string;
    library_capsule?: string;
    small_capsule?: string;
  };
  basic_info?: {
    short_description?: string;
    developers?: { name?: string }[];
  };
  release?: { steam_release_date?: number };
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
};

type SteamListResponse = {
  response?: { store_items?: SteamItem[] };
};

function apiKey(): string {
  return requireEnv("STEAM_API_KEY");
}

function coverUrl(assets: SteamItem["assets"] | undefined): string | null {
  if (!assets?.asset_url_format) return null;
  const file = assets.library_capsule || assets.header || assets.small_capsule;
  if (!file) return null;
  return `https://shared.akamai.steamstatic.com/store_item_assets/${assets.asset_url_format.replace(
    "${FILENAME}",
    file,
  )}`;
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

const CONTEXT = { language: "schinese", country_code: "CN", steam_realm: 1 };
const DATA_REQUEST = {
  include_assets: true,
  include_basic_info: true,
  include_release: true,
  include_platforms: true,
};

async function steamWebGet(path: string, input: object): Promise<SteamListResponse> {
  const url = new URL(`https://api.steampowered.com/${path}`);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("input_json", JSON.stringify(input));
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
  return (await res.json()) as SteamListResponse;
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
      data_request: DATA_REQUEST,
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
