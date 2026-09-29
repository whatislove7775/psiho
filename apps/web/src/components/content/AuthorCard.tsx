"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button, useToast } from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { useAuth } from "@/lib/auth/store";
import { dialogsApi } from "@/lib/api/dialogs";
import { ApiError } from "@/lib/api/client";
import { countRead } from "@/lib/api/authoring";
import type { Article } from "@/lib/api/content";
import { typo } from "@/lib/typography";
import { experienceLabel } from "@/lib/format";
import s from "./author.module.css";

/**
 * «Автор статьи» — one compact row after the text: 40px photo, name, «Специалист Aprosop · опыт N лет»,
 * a two-line bio, «Профиль →» and a quiet «Начать диалог».
 * Guests go through /start and come back to the profile.
 */
export function AuthorCard({ specialist: p }: { specialist: NonNullable<Article["specialist"]> }) {
  const { user, status, bootstrap } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  useEffect(() => void bootstrap(), [bootstrap]);

  const profile = `/app/specialists/${p.id}`;
  const isClient = status === "authed" && user?.role === "client";
  const guestHref = `/start?next=${encodeURIComponent(profile)}`;

  const write = async () => {
    setBusy(true);
    try {
      const d = await dialogsApi.startWithSpecialist(p.id);
      router.push(`/app/dialogs?d=${encodeURIComponent(d.id)}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не\u00a0получилось начать диалог", { error: true });
      setBusy(false);
    }
  };

  const href = status === "authed" ? profile : guestHref;
  const sub = ["Специалист Aprosop", p.experience_years ? experienceLabel(p.experience_years, "опыт") : ""].filter(Boolean).join(" · ");
  const canWrite = isClient || status !== "authed";

  return (
    <aside className={s.card} aria-label="Автор статьи">
      <Link href={href} className={s.photo} tabIndex={-1} aria-hidden>
        <SpecialistPhoto url={p.photo_url} name={p.name} size={40} alt="" />
      </Link>
      <div className={s.body}>
        <Link href={href} className={s.name}>
          {p.name}
        </Link>
        <span className={s.meta}>{sub}</span>
        {p.bio && <p className={s.bio}>{typo(p.bio)}</p>}
      </div>
      <div className={s.actions}>
        <Link href={href} className={s.more}>
          Профиль
          <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
        {canWrite &&
          (isClient ? (
            <Button variant="soft" size="sm" loading={busy} onClick={write} icon={<MessageCircle size={15} strokeWidth={1.8} />}>
              Начать диалог
            </Button>
          ) : (
            <Button variant="soft" size="sm" href={guestHref} icon={<MessageCircle size={15} strokeWidth={1.8} />}>
              Начать диалог
            </Button>
          ))}
      </div>
    </aside>
  );
}

/** Counts one read per page view (after a few seconds on the page). */
export function ReadCounter({ slug }: { slug: string }) {
  useEffect(() => {
    const t = setTimeout(() => countRead(slug), 5000);
    return () => clearTimeout(t);
  }, [slug]);
  return null;
}
