"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/ui";

const KEY = "aprosop.theme";

/** Inline script for <head>: applies the saved theme before first paint. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
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
      aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      onClick={toggle}
      icon={theme === "dark" ? <Sun size={20} strokeWidth={1.8} /> : <Moon size={20} strokeWidth={1.8} />}
    />
  );
}
