export function formatYuan(fen: number): string {
  const yuan = fen / 100;
  const text = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
  return `¥${text}`;
}

export function formatFenLabel(fen: number | null): string {
  if (fen == null) return "—";
  if (fen === 0) return "免费";
  return formatYuan(fen);
}

export type DlcPriceBit = {
  appid: number;
  originalFen: number | null;
  owned: boolean;
};

/** 本体（购入或原价）+ 已购 DLC（购入或原价）；未购但填了购入价的也加进购入合计。 */
export function gamePriceFen(
  appid: number,
  originalFen: number | null,
  dlc: DlcPriceBit[] | undefined,
  paidByApp: Map<number, number>,
): { paid: number | null; original: number | null } {
  const bits = dlc ?? [];
  if (bits.length === 0) {
    return { paid: paidByApp.get(appid) ?? originalFen, original: originalFen };
  }
  const ownedOrigSum = bits.reduce((sum, row) => {
    if (!row.owned || row.originalFen == null || row.originalFen <= 0) return sum;
    return sum + row.originalFen;
  }, 0);
  const baseOrig = originalFen == null ? null : originalFen - ownedOrigSum;
  let paid: number | null = paidByApp.get(appid) ?? baseOrig;
  for (const row of bits) {
    const custom = paidByApp.get(row.appid);
    if (custom != null) {
      paid = (paid ?? 0) + custom;
      continue;
    }
    if (row.owned && row.originalFen != null) {
      paid = (paid ?? 0) + row.originalFen;
    }
  }
  return { paid, original: originalFen };
}

export function formatHours(min: number): string {
  if (min <= 0) return "0 小时";
  if (min < 60) return `${min} 分钟`;
  const h = min / 60;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} 小时`;
}

export function formatPlaytime(min: number, recentMin?: number): string {
  const forever = `总时长 ${formatHours(min)}`;
  if (recentMin && recentMin > 0) {
    return `${forever} · 近两周 ${formatHours(recentMin)}`;
  }
  return forever;
}

export function formatBackupTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}
