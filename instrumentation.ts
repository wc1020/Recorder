export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { startSnapshotScheduler } = await import("./lib/db-snapshot");
  startSnapshotScheduler();
}
