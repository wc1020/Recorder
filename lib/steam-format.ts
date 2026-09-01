export function formatYuan(fen: number): string {
  return `¥${(fen / 100).toFixed(2)}`;
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
): {
  paid: number | null;
  original: number | null;
  basePaid: number | null;
  baseOriginal: number | null;
} {
  const bits = dlc ?? [];
  if (bits.length === 0) {
    const paid = paidByApp.get(appid) ?? originalFen;
    return {
      paid,
      original: originalFen,
      basePaid: paid,
      baseOriginal: originalFen,
    };
  }
  const ownedOrigSum = bits.reduce((sum, row) => {
    if (!row.owned || row.originalFen == null || row.originalFen <= 0) return sum;
    return sum + row.originalFen;
  }, 0);
  const baseOriginal =
    originalFen == null ? null : Math.max(0, originalFen - ownedOrigSum);
  const basePaid = paidByApp.get(appid) ?? baseOriginal;
  let paid: number | null = basePaid;
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
  return { paid, original: originalFen, basePaid, baseOriginal };
}

export function formatHours(min: number): string {
  if (min <= 0) return "0 小时";
  if (min < 60) return `${min} 分钟`;
  const h = min / 60;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} 小时`;
}

/** 详情页时长数字：一律按小时，0 / 一位小数 / 整数。 */
export function formatHourNumber(min: number): string {
  if (min <= 0) return "0";
  const h = min / 60;
  if (h >= 10) return String(Math.round(h));
  const tenths = Math.round(h * 10) / 10;
  return String(tenths);
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
