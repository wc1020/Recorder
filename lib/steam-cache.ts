import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { SteamPlayerPage, SteamProfile, SteamXp } from "./providers/steam";

const FILE = path.join(process.cwd(), "local", "steam-cache.json");

export type SteamPerfectItem = { appid: number; completedAt: number };

export type SteamBackup = {
  savedAt: string;
  player: SteamPlayerPage;
  perfect: SteamPerfectItem[] | null;
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
  });
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
