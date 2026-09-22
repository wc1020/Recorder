export const THEME_STORAGE_KEY = "projectm-theme";

export const THEMES = [
  { id: "default", label: "默认", swatch: null },
  { id: "dark", label: "黑", swatch: "#111" },
  { id: "light", label: "白", swatch: "#fff" },
  { id: "red", label: "红", swatch: "#c62828" },
  { id: "orange", label: "橙", swatch: "#ef6c00" },
  { id: "yellow", label: "黄", swatch: "#c9a227" },
  { id: "green", label: "绿", swatch: "#2e7d32" },
  { id: "cyan", label: "青", swatch: "#00838f" },
  { id: "blue", label: "蓝", swatch: "#1565c0" },
  { id: "violet", label: "紫", swatch: "#6a1b9a" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return Boolean(value && THEME_IDS.has(value));
}

export function readStoredTheme(): ThemeId {
  if (typeof localStorage === "undefined") return "default";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(raw) ? raw : "default";
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
