import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { SteamGamePage, SteamPlayerPage, SteamProfile, SteamXp } from "./providers/steam";

const FILE = path.join(process.cwd(), "local", "steam-cache.json");

export type SteamPerfectItem = { appid: number; completedAt: number };

export type SteamBackup = {
  savedAt: string;
  player: SteamPlayerPage;
  perfect: SteamPerfectItem[] | null;
  games?: Record<string, SteamGamePage>;
};

let memory: SteamBackup | null = null;

function stripLiveFlags(player: SteamPlayerPage): SteamPlayerPage {
  return {
    ...player,
    fromCache: false,
    cachedAt: null,
    cacheReason: null,
  };
}

export async function loadSteamBackup(): Promise<SteamBackup | null> {
  if (memory?.player?.owned) return memory;
  try {
    const raw = await readFile(FILE, "utf8");
    const data = JSON.parse(raw) as SteamBackup;
    if (!data?.player?.owned || !Array.isArray(data.player.owned)) return null;
    memory = data;
    return data;
  } catch {
    return null;
  }
}

async function writeBackup(next: SteamBackup): Promise<void> {
  memory = next;
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(next), "utf8");
}

export async function saveSteamPlayerBackup(player: SteamPlayerPage): Promise<void> {
  const prev = await loadSteamBackup();
  await writeBackup({
    savedAt: new Date().toISOString(),
    player: stripLiveFlags(player),
    perfect: prev?.perfect ?? null,
    games: mergeGameDetails(prev?.games, player),
  });
}

export async function saveSteamGameBackup(page: SteamGamePage): Promise<void> {
  const prev = await loadSteamBackup();
  if (!prev) return;
  await writeBackup({
    ...prev,
    games: { ...prev.games, [String(page.appid)]: page },
  });
}

function mergeGameDetails(
  prev: Record<string, SteamGamePage> | undefined,
  player: SteamPlayerPage,
): Record<string, SteamGamePage> | undefined {
  if (!prev) return undefined;
  const next = { ...prev };
  for (const g of [...player.owned, ...player.family, ...player.recentlyPlayed]) {
    const d = next[String(g.appid)];
    if (!d) continue;
    next[String(g.appid)] = {
      ...d,
      name: g.name || d.name,
      playtimeForeverMin: g.playtimeForeverMin,
      playtime2WeeksMin: g.playtime2WeeksMin,
      price: g.price ?? d.price,
      originalFen: g.originalFen ?? d.originalFen,
    };
  }
  return next;
}

export async function saveSteamPerfectBackup(items: SteamPerfectItem[]): Promise<void> {
  const prev = await loadSteamBackup();
  if (!prev) return;
  await writeBackup({
    ...prev,
    perfect: items,
  });
}

/** 只改资料卡和等级，不改库存备份时间。 */
export async function saveSteamProfileBackup(
  profile: SteamProfile,
  xp: SteamXp | null,
): Promise<void> {
  const prev = await loadSteamBackup();
  if (!prev) return;
  await writeBackup({
    ...prev,
    player: { ...prev.player, profile, xp },
  });
}

export { formatBackupTime } from "./steam-format";
