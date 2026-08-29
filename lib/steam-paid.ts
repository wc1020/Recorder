import { prisma } from "./db";

export async function listPaidFen(appids: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (appids.length === 0) return map;
  const want = new Set(appids);
  const rows = await prisma.$queryRaw<Array<{ appid: number; paid_fen: number }>>`
    SELECT appid, paid_fen FROM steam_paid_prices
  `;
  for (const row of rows) {
    if (want.has(row.appid)) map.set(row.appid, row.paid_fen);
  }
  return map;
}

export async function savePaidFen(appid: number, paidFen: number | null): Promise<void> {
  await prisma.$executeRaw`DELETE FROM steam_paid_prices WHERE appid = ${appid}`;
  if (paidFen == null) return;
  await prisma.$executeRaw`
    INSERT INTO steam_paid_prices (appid, paid_fen, updated_at)
    VALUES (${appid}, ${paidFen}, datetime('now'))
  `;
}
