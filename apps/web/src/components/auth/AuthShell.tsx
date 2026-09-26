import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/landing/SiteHeader";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import a from "./art.module.css";
import s from "./auth.module.css";

/** Quiet frame for sign-in pages: logo, theme switch, one centered column. */
export function AuthShell({ children, wide, art }: { children: ReactNode; wide?: boolean; art?: ReactNode }) {
  const column = <div className={`${s.column} ${wide ? s.columnWide : ""}`}>{children}</div>;
  return (
    <div className={s.shell}>
      <header className={s.top}>
        <Brand />
        <ThemeToggle />
      </header>
      <main className={s.main}>
        {art ? (
          <div className={a.withArt} data-wide={wide ? "" : undefined}>
            <div className={a.art}>{art}</div>
            {column}
          </div>
        ) : (
          column
        )}
      </main>
    </div>
  );
}

export function AuthCard({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.card}>
      <div className={s.head}>
        <h1 className={s.title}>{title}</h1>
        {sub && <p className={s.sub}>{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export function AuthLinks({ links }: { links: { href: string; label: string; prefix?: string }[] }) {
  return (
    <nav className={s.links} aria-label="Другие действия">
      {links.map((l) => (
        <span key={l.href}>
          {l.prefix && <>{l.prefix} </>}
          <Link href={l.href}>{l.label}</Link>
        </span>
      ))}
    </nav>
  );
}

/** Only allow same-site relative redirects from ?next=. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
