import { createHash } from "crypto";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { SNAPSHOT_INTERVAL_MS, SNAPSHOT_KEEP } from "./constants";
import { prisma } from "./db";

const LOCAL = path.join(process.cwd(), "local");
const DB = path.join(LOCAL, "dev.db");
const CACHE = path.join(LOCAL, "steam-cache.json");
const SNAP_DIR = path.join(LOCAL, "snapshots");
const LIVE_FILES = [DB, `${DB}-wal`, `${DB}-shm`, CACHE];

type SnapMeta = { at: string; fingerprint: string };

function sqliteLiteral(file: string): string {
  return file.replace(/\\/g, "/").replace(/'/g, "''");
}

async function fileFingerprint(file: string): Promise<string | null> {
  try {
    const s = await stat(file);
    return `${path.basename(file)}:${s.size}:${s.mtimeMs}`;
  } catch {
    return null;
  }
}

async function liveFingerprint(): Promise<string> {
  const parts = await Promise.all(LIVE_FILES.map(fileFingerprint));
  return createHash("sha256")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex");
}

function stampName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

async function listSnapshotDirs(): Promise<string[]> {
  try {
    const names = await readdir(SNAP_DIR);
    return names
      .filter((n) => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(n))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

async function latestMeta(): Promise<SnapMeta | null> {
  const dirs = await listSnapshotDirs();
  if (!dirs[0]) return null;
  try {
    const raw = await readFile(path.join(SNAP_DIR, dirs[0], "meta.json"), "utf8");
    const data = JSON.parse(raw) as SnapMeta;
    if (!data?.at || !data.fingerprint) return null;
    return data;
  } catch {
    return null;
  }
}

async function pruneSnapshots(): Promise<void> {
  const dirs = await listSnapshotDirs();
  for (const name of dirs.slice(SNAPSHOT_KEEP)) {
    await rm(path.join(SNAP_DIR, name), { recursive: true, force: true });
  }
}

async function writeSnapshot(fingerprint: string): Promise<string> {
  const name = stampName();
  const dir = path.join(SNAP_DIR, name);
  await mkdir(dir, { recursive: true });
  const destDb = path.join(dir, "dev.db");
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${sqliteLiteral(destDb)}'`);
  } catch {
    await copyFile(DB, destDb);
    for (const extra of [`${DB}-wal`, `${DB}-shm`]) {
      try {
        await copyFile(extra, path.join(dir, path.basename(extra)));
      } catch {
        /* 没有 wal 就跳过 */
      }
    }
  }
  try {
    await copyFile(CACHE, path.join(dir, "steam-cache.json"));
  } catch {
    /* 还没有 Steam 备份就只留库 */
  }
  const meta: SnapMeta = { at: new Date().toISOString(), fingerprint };
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta), "utf8");
  await pruneSnapshots();
  return name;
}

/** 距上次快照满 2 小时、且本地数据确实变了，才写一份。 */
export async function maybeWriteDataSnapshot(): Promise<string | null> {
  try {
    await stat(DB);
  } catch {
    return null;
  }
  const last = await latestMeta();
  if (last && Date.now() - Date.parse(last.at) < SNAPSHOT_INTERVAL_MS) {
    return null;
  }
  const fingerprint = await liveFingerprint();
  if (last?.fingerprint === fingerprint) return null;
  const name = await writeSnapshot(fingerprint);
  console.info(`[projectM] 数据快照 ${name}（最多留 ${SNAPSHOT_KEEP} 份）`);
  return name;
}

const g = globalThis as { __pmSnapshotTimer?: ReturnType<typeof setInterval> };

export function startSnapshotScheduler(): void {
  if (g.__pmSnapshotTimer) return;
  void maybeWriteDataSnapshot();
  const timer = setInterval(() => {
    void maybeWriteDataSnapshot();
  }, SNAPSHOT_INTERVAL_MS);
  timer.unref?.();
  g.__pmSnapshotTimer = timer;
}
