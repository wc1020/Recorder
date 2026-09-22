"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  THEMES,
  type ThemeId,
} from "@/lib/theme";

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>("default");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: ThemeId) {
    setTheme(next);
    persistTheme(next);
    setOpen(false);
  }

  return (
    <div className="theme-switcher" ref={rootRef}>
      <button
        type="button"
        className="header-theme"
        aria-label="更换主题"
        title="更换主题"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="header-theme-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="12" cy="5.5" r="3" fill="#e53935" />
            <circle cx="18.2" cy="9.2" r="3" fill="#fb8c00" />
            <circle cx="18.2" cy="15.8" r="3" fill="#fdd835" />
            <circle cx="12" cy="19.5" r="3" fill="#43a047" />
            <circle cx="5.8" cy="15.8" r="3" fill="#1e88e5" />
            <circle cx="5.8" cy="9.2" r="3" fill="#8e24aa" />
          </svg>
        </span>
      </button>
      {open ? (
        <div className="theme-menu" id={menuId} role="menu" aria-label="主题">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === t.id}
              className={theme === t.id ? "theme-option active" : "theme-option"}
              onClick={() => pick(t.id)}
            >
              <span
                className={
                  t.swatch
                    ? t.id === "light"
                      ? "theme-swatch is-light"
                      : "theme-swatch"
                    : "theme-swatch is-default"
                }
                style={t.swatch ? { background: t.swatch } : undefined}
                aria-hidden
              />
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
