import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "./JsonLd";
import s from "./public.module.css";

export interface Crumb {
  name: string;
  href: string;
}

/** Visible breadcrumb trail + BreadcrumbList JSON-LD. The last item is the current page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <>
      <nav aria-label="Навигационная цепочка" className={s.crumbs}>
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
