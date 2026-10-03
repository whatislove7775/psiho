import { t } from "@/lib/i18n";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "./JsonLd";
import { lp } from "@/lib/i18n";
import s from "./public.module.css";

export interface Crumb {
  name: string;
  href: string;
}

/** Visible breadcrumb trail + BreadcrumbList JSON-LD. The last item is the current page. */
export function Breadcrumbs({ items: raw }: { items: Crumb[] }) {
  // Links stay in the page language (/en/…)
  const items = raw.map((it) => ({ ...it, href: lp(it.href) }));
  return (
    <>
      <nav aria-label={t("Навигационная цепочка")} className={s.crumbs}>
        <ol>
          {items.map((it, i) => {
            const last = i === items.length - 1;
            return (
              <li key={it.href}>
                {last ? (
                  <span aria-current="page">{it.name}</span>
                ) : (
                  <>
                    <Link href={it.href}>{it.name}</Link>
                    <ChevronRight size={14} strokeWidth={2} aria-hidden />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbLd(items)} />
    </>
  );
}
