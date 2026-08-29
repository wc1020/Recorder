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
