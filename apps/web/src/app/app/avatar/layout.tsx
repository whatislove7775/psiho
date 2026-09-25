"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ScanFace, ShieldCheck, Smile } from "lucide-react";
import s from "./tabs.module.css";

const TABS = [
  { href: "/app/avatar", label: "Аватар", icon: Smile },
  { href: "/app/avatar/mirror", label: "Зеркало", icon: ScanFace },
  { href: "/app/avatar/privacy", label: "Приватность", icon: ShieldCheck },
];

/** «Аватар»: one nav item for everything about anonymity — the avatar, the mirror (camera check) and privacy. */
export default function AvatarLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <>
      <nav className={s.tabs} aria-label="Аватар и приватность">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href} className={s.tab} aria-current={active ? "page" : undefined}>
              <Icon size={18} strokeWidth={1.8} aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </>
  );
}
