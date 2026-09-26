"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Leaf } from "lucide-react";
import s from "./usefulTabs.module.css";

const TABS = [
  { href: "/app/articles", label: "Статьи", icon: BookOpen },
  { href: "/app/practices", label: "Практики", icon: Leaf },
];

/** «Полезное»: one nav item, two tabs — articles first, then practices. */
export function UsefulTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav className={s.tabs} aria-label="Разделы полезного">
      {TABS.map(({ href, label, icon: Icon }) => {
        const on = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link key={href} href={href} className={s.tab} aria-current={on ? "page" : undefined}>
            <Icon size={16} strokeWidth={2} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
