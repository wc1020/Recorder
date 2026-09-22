export const THEME_STORAGE_KEY = "projectm-theme";

/** 氛围主题：不只换色，还改质感 / 圆角 / 字重语气。 */
export const THEMES = [
  {
    id: "default",
    label: "默认",
    blurb: "现在这套奶油底",
    swatch: "linear-gradient(135deg,#f4f1ea 50%,#0d47a1 50%)",
  },
  {
    id: "film",
    label: "胶片",
    blurb: "暖黄颗粒 · 影院感",
    swatch: "linear-gradient(135deg,#e8d9c0,#8b4513)",
  },
  {
    id: "paper",
    label: "纸质",
    blurb: "米白细线 · 旧日记",
    swatch: "linear-gradient(135deg,#f7f4ec,#2c2c2c)",
  },
  {
    id: "crt",
    label: "夜机",
    blurb: "扫描线 · 霓虹边",
    swatch: "linear-gradient(135deg,#0a0e12,#39ff14)",
  },
  {
    id: "cyber",
    label: "赛博",
    blurb: "近黑雨夜 · 青紫光",
    swatch: "linear-gradient(135deg,#07080f,#7c5cff 45%,#00e5ff)",
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

/** 旧版色板主题迁到氛围主题。 */
const LEGACY_THEME: Record<string, ThemeId> = {
  dark: "crt",
  light: "paper",
  red: "film",
  orange: "film",
  yellow: "film",
  green: "default",
  cyan: "cyber",
  blue: "default",
  violet: "cyber",
};

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return Boolean(value && THEME_IDS.has(value));
}

export function normalizeThemeId(raw: string | null | undefined): ThemeId {
  if (!raw) return "default";
  if (isThemeId(raw)) return raw;
  return LEGACY_THEME[raw] ?? "default";
}

export function readStoredTheme(): ThemeId {
  if (typeof localStorage === "undefined") return "default";
  try {
    return normalizeThemeId(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "default";
  }
}

export function applyTheme(theme: ThemeId) {
  if (theme === "default") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function persistTheme(theme: ThemeId) {
  applyTheme(theme);
  try {
    if (theme === "default") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}
