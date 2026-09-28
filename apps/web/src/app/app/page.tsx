"use client";

import { FactsLine } from "@/components/specialists/SpecialistFacts";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Search, Users, Video } from "lucide-react";
import { useAuth } from "@/lib/auth/store";
import { psychologistsApi } from "@/lib/api/endpoints";
import { contentApi } from "@/lib/api/content";
import type { PsychologistPublic } from "@/lib/api/types";
import { dialogHref } from "@/lib/api/dialogs";
import { rub, when } from "@/lib/format";
import { typo } from "@/lib/typography";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { useDialogsSummary } from "@/components/dialogs/HomeWidgets";
import { isLive } from "@/components/dialogs/time";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { TopicArt } from "@/components/illustrations/topics";
import { SearchTrigger } from "@/components/search/SpecialistSearch";
import { Button, ScrollRow, Skeleton } from "@/ui";
import c from "@/components/content/content.module.css";
import s from "./home.module.css";

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export default function ClientHome() {
  const user = useAuth((st) => st.user);
  const dialogs = useDialogsSummary();
  const specialists = useLoad(() => psychologistsApi.list());
  const articles = useLoad(() => contentApi.articles({ limit: 6 }));
  const practices = useLoad(() => contentApi.practices({ limit: 4 }));
  const [hello, setHello] = useState("Здравствуйте");

  useEffect(() => setHello(greeting()), []);

  const featured = (specialists.data ?? []).slice(0, 10);

  return (
    <div className={s.home}>
      <header className={s.hero}>
        <h1 className={s.greetTitle}>
          {hello},<br />
          <span className={s.alias} style={{ ["--len" as string]: Math.max(8, (user?.alias ?? "").length) }}>
            {user?.alias ?? ""}
          </span>
        </h1>
        <Link href="/app/avatar" className={s.greetAvatar} aria-label="Мой аватар">
          <AvatarThumb config={user?.avatar_config} seed={user?.id} size={160} framing="portrait" />
        </Link>
        <div className={s.heroBody}>
          <CallsLine dialogs={dialogs} />
          <SearchTrigger variant="primary" size="lg" className={s.find} icon={<Search size={20} strokeWidth={2} />}>
            Найти специалиста
          </SearchTrigger>
        </div>
      </header>

      {dialogs.error && <ErrorBlock message={dialogs.error} onRetry={dialogs.reload} />}

      <Section title="Специалисты" href="/app/specialists">
        {specialists.error ? (
          <ErrorBlock message={specialists.error} onRetry={specialists.reload} />
        ) : (
          <ScrollRow trackClassName={s.scroller}>
            {specialists.loading && !specialists.data
              ? [0, 1, 2, 3].map((i) => (
                  <div role="listitem" key={i} className={s.spec} aria-hidden>
                    <span className={s.specPhoto}>
                      <Skeleton height="100%" radius={20} />
                    </span>
                    <Skeleton width="70%" height={16} />
                    <Skeleton width="50%" height={12} />
                  </div>
                ))
              : featured.map((p) => <SpecCard key={p.id} p={p} />)}
          </ScrollRow>
        )}
      </Section>

      <Link href="/app/circles" className={s.entry}>
        <Users size={20} strokeWidth={1.8} aria-hidden />
        <span>
          <strong>Круги</strong> · группы поддержки с&nbsp;психологом
        </span>
        <ChevronRight size={18} strokeWidth={2} aria-hidden />
      </Link>

      <Section title="Полезное" href="/app/articles">
        <ScrollRow trackClassName={s.scroller}>
          {articles.loading && !articles.data
            ? [0, 1, 2].map((i) => <Skeleton key={i} width={260} height={72} radius={16} />)
            : (articles.data ?? []).map((a) => (
                <Link role="listitem" key={a.id} href={`/app/articles/${a.slug}`} className={s.article}>
                  <span className={`${s.articleArt} ${c.tone}`} data-tone={a.cover} aria-hidden>
                    <TopicArt topic={a.topic} />
                  </span>
                  <span className={s.articleText}>
                    <strong>{typo(a.title)}</strong>
                    <span>{a.reading_minutes} мин</span>
                  </span>
                </Link>
              ))}
        </ScrollRow>
        {(practices.data ?? []).length > 0 && (
          <div className={s.chips}>
            {(practices.data ?? []).map((p) => (
              <Link key={p.id} href={`/app/practices/${p.slug}`} className={s.practice}>
                <span className={`${s.practiceArt} ${c.tone}`} data-tone={p.cover} aria-hidden>
                  <TopicArt topic={p.kind} />
                </span>
                {p.title}
                <span className={s.practiceMin}>{p.duration_minutes} мин</span>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/** «Запланированные звонки: …» — the nearest call as one bold line (+ a join button when live). */
function CallsLine({ dialogs }: { dialogs: ReturnType<typeof useDialogsSummary> }) {
  const item = dialogs.next;
  const call = item?.next_call;
  if (dialogs.loading) return <Skeleton width="80%" height={20} />;
  if (!item || !call) {
    return (
      <p className={s.calls}>
        Запланированные звонки: <span className={s.callsValue}>нет звонков</span>
      </p>
    );
  }
  const live = isLive(call);
  const w = when(call.scheduled_at);
  const text = `${live ? "идёт сейчас" : w.charAt(0).toLowerCase() + w.slice(1)} · ${item.counterpart.name}`;
  return (
    <div className={s.callsRow}>
      <Link href={dialogHref("client", item.id)} className={s.calls}>
        Запланированные звонки: <span className={s.callsValue}>{text}</span>
        {call.status === "awaiting_payment" && <span className={s.callsNote}> · ждёт оплаты</span>}
      </Link>
      {call.can_join && (
        <Button variant="soft" size="sm" href={`/room/${call.id}`} icon={<Video size={16} strokeWidth={1.9} />}>
          Присоединиться
        </Button>
      )}
    </div>
  );
}

const TINTS = [
  ["var(--p-sky)", "var(--p-lilac)"],
  ["var(--p-mint)", "var(--p-sky)"],
  ["var(--p-peach)", "var(--p-butter)"],
  ["var(--p-lilac)", "var(--p-peach)"],
  ["var(--p-lime)", "var(--p-mint)"],
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Tall specialist card for the home carousel: photo (or initials on a pastel gradient), name, topics, price. */
function SpecCard({ p }: { p: PsychologistPublic }) {
  const [broken, setBroken] = useState(false);
  const [a, b] = TINTS[p.id % TINTS.length];
  const topics = p.specializations.join(", ") || p.approach || "Психолог";
  return (
    <Link role="listitem" href={`/app/specialists/${p.id}`} className={s.spec}>
      <span className={s.specPhoto} style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}>
        {p.photo_url && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo_url} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <span className={s.specInitials} aria-hidden>
            {initials(p.display_name)}
          </span>
        )}
      </span>
      <span className={s.specName}>{p.display_name}</span>
      <FactsLine p={p} className={s.specTopics} />
      <span className={s.specTopics}>{topics}</span>
      <span className={s.specPrice}>{rub(p.session_rate_rub)}</span>
    </Link>
  );
}

function Section({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{title}</h2>
        <Link href={href} className={s.seeAll} aria-label={`${title}: все`}>
          Все
          <ChevronRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      {children}
    </section>
  );
}
