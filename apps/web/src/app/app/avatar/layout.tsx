"use client";

import { t as tt } from "@/lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ScanFace, ShieldCheck, Smile } from "lucide-react";
import s from "./tabs.module.css";

const TABS = [
  { href: "/app/avatar", get label() { return tt("Аватар"); }, icon: Smile },
  { href: "/app/avatar/mirror", get label() { return tt("Зеркало"); }, icon: ScanFace },
  { href: "/app/avatar/privacy", get label() { return tt("Приватность"); }, icon: ShieldCheck },
];

/** «Аватар»: one nav item for everything about anonymity — the avatar, the mirror (camera check) and privacy. */
export default function AvatarLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <>
      <nav className={s.tabs} aria-label={tt("Аватар и\u00a0приватность")}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href} className={s.tab} aria-current={active ? "page" : undefined}>
              <Icon size={18} strokeWidth={1.8} aria-hidden />
              <span className={s.label}>{t.label}</span>
            </Link>
          );
        })}
      </nav>
      {children}
    </>
  );
}
