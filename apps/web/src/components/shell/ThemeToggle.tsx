"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import s from "./ThemeToggle.module.css";

const KEY = "aprosop.theme";

/** Inline script for <head>: applies the saved theme before first paint. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

/**
 * Sun ↔ moon switch. The visible icon follows html[data-theme] via CSS, so the
 * first paint is already right and nothing animates on load. Page-wide
 * transitions are suspended during the swap (html.theme-swap) to avoid a flash.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    // Keep several toggles on one page (sidebar + mobile header) in sync.
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.classList.add("theme-swap");
    if (next === "light") root.dataset.theme = "light";
    else delete root.dataset.theme;
    void getComputedStyle(root).backgroundColor; // commit the new colours without transitions
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-swap")));
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  };

  const label = theme === "light" ? "Включить тёмную тему" : "Включить светлую тему";
  return (
    <button
      type="button"
      className={className ? `${s.toggle} ${className}` : s.toggle}
      aria-label={label}
      onClick={toggle}
      suppressHydrationWarning
    >
      <Sun className={`${s.icon} ${s.sun}`} size={20} strokeWidth={1.8} aria-hidden data-theme-icon="" />
      <Moon className={`${s.icon} ${s.moon}`} size={20} strokeWidth={1.8} aria-hidden data-theme-icon="" />
    </button>
  );
}
