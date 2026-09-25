"use client";

import { useEffect, useState } from "react";
import { Button } from "@/ui";
import { MI, Morph } from "@/components/ui/Morph";

const KEY = "aprosop.theme";

/** Inline script for <head>: applies the saved theme before first paint. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export function ThemeToggle() {
  // null until mounted: the morph icon then paints the real theme without animating
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  };

  return (
    <Button
      variant="ghost"
      size="md"
      iconOnly
      aria-label={theme === "light" ? "Тёмная тема" : "Светлая тема"}
      onClick={toggle}
      icon={<Morph icon={theme ? (theme === "dark" ? MI.Sun : MI.Moon) : undefined} size={20} spring="bouncy" />}
    />
  );
}
