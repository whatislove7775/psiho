"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Search, Wind } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/ui";
import { WithRail } from "@/components/shell/AppShell";
import { useAuth } from "@/lib/auth/store";
import { psychologistsApi } from "@/lib/api/endpoints";
import { contentApi } from "@/lib/api/content";
import { useLoad } from "@/components/client/useLoad";
import { checkDone } from "@/components/client/sessions";
import { ErrorBlock } from "@/components/client/ClientBits";
import { SupportCard } from "@/components/client/NextSessionCard";
import { NextCallCard, RecentDialogs, useDialogsSummary } from "@/components/dialogs/HomeWidgets";
import { SpecialistMini, SpecialistMiniSkeleton } from "@/components/client/SpecialistMini";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { ArticleCard, ArticleCardSkeleton, PracticeCard, PracticeCardSkeleton } from "@/components/content/Cards";
import { Celestial } from "@/components/illustrations";
import h from "./homeArt.module.css";
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
  const practices = useLoad(() => contentApi.practices({ limit: 6 }));
  const topics = useLoad(() => contentApi.topics());
  const [checked, setChecked] = useState(false);
  const [hello, setHello] = useState("Здравствуйте");
  const [night, setNight] = useState(false);

  useEffect(() => {
    setChecked(checkDone.get());
    setHello(greeting());
    const hour = new Date().getHours();
    setNight(hour < 5 || hour >= 18);
  }, []);

  const next = dialogs.next;
  const hasAny = useMemo(() => (dialogs.items ?? []).some((d) => d.kind === "specialist"), [dialogs.items]);

  const steps = [
    { done: !!user?.avatar_config, title: "Создать аватар", text: "Им вы будете на созвоне вместо лица", href: "/app/avatar" },
    { done: hasAny, title: "Начать диалог со специалистом", text: "Напишите или сразу назначьте созвон", href: "/app/specialists" },
    { done: checked, title: "Проверить камеру и свет", text: "Минута, чтобы аватар точно повторял мимику", href: "/app/avatar/mirror" },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const showSteps = !dialogs.loading && doneCount < steps.length;

  const featured = (specialists.data ?? []).slice(0, 8);

  return (
    <WithRail
      rail={
        <>
          <div className={s.wideOnly}>
            <NextCallCard item={next} loading={dialogs.loading} role="client" />
          </div>
          <SupportCard />
        </>
      }
    >
      {/* Hero: greeting + the one thing most people come for */}
      <section className={s.hero}>
        <div className={s.heroText}>
          <h1 className={s.heroTitle}>
            {hello}, <span className={s.alias}>{user?.alias ?? ""}</span>
          </h1>
          <p className={s.heroSub}>
            Здесь можно говорить свободно. Специалист видит только ваш аватар и псевдоним.
          </p>
          <div className={s.heroActions}>
            <Button variant="white" size="lg" href="/app/specialists" icon={<Search size={18} strokeWidth={2} />}>
              Найти специалиста
            </Button>
            <Link href="/app/practices/dyhanie-4-6" className={s.heroLink}>
              <Wind size={18} strokeWidth={1.8} aria-hidden />
              Дыхательная пауза
            </Link>
          </div>
        </div>
        <div className={h.avatarWrap}>
          <Link href="/app/avatar" className={s.heroAvatar} aria-label="Мой аватар">
            <AvatarThumb config={user?.avatar_config} seed={user?.id} size={132} />
          </Link>
          <Celestial night={night} className={h.sky} />
        </div>
      </section>

      {dialogs.error && <ErrorBlock message={dialogs.error} onRetry={dialogs.reload} />}

      {/* On narrow screens the nearest call comes right after the greeting */}
      <div className={s.narrowOnly}>
        <NextCallCard item={next} loading={dialogs.loading} role="client" />
      </div>

      {showSteps && (
        <Card as="section">
          <CardHead
            title="Первые шаги"
            action={<Badge tone="warning">{doneCount} из {steps.length}</Badge>}
          />
          <ul className={s.steps}>
            {steps.map((st) => (
              <li key={st.title}>
                <Link href={st.href} className={s.step} data-done={st.done || undefined}>
                  <span className={s.stepCheck} aria-hidden>
                    {st.done && <Check size={14} strokeWidth={2.6} />}
                  </span>
                  <span className={s.stepText}>
                    <strong>{st.title}</strong>
                    <span>{st.done ? "Готово" : st.text}</span>
                  </span>
                  <span className={s.srOnly}>{st.done ? ", выполнено" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {hasAny && <RecentDialogs items={dialogs.recent} role="client" />}

      <Card as="section">
        <CardHead
          title="Специалисты"
          sub="Все психологи проверены: образование, опыт, супервизия"
          action={<SeeAll href="/app/specialists" label="Все специалисты" />}
        />
        {specialists.error ? (
          <ErrorBlock message={specialists.error} onRetry={specialists.reload} />
        ) : (
          <div className={s.carousel} role="list">
            {specialists.loading && !specialists.data
              ? [0, 1, 2, 3].map((i) => (
                  <div role="listitem" key={i}>
                    <SpecialistMiniSkeleton />
                  </div>
                ))
              : featured.map((p) => (
                  <div role="listitem" key={p.id}>
                    <SpecialistMini p={p} />
                  </div>
                ))}
            {specialists.data && featured.length === 0 && (
              <p className={s.muted}>Скоро здесь появятся специалисты. Загляните чуть позже.</p>
            )}
          </div>
        )}
      </Card>

      <Card as="section">
        <CardHead
          title="Практики"
          sub="Короткие упражнения, когда нужно успокоиться или собраться"
          action={<SeeAll href="/app/practices" label="Все практики" />}
        />
        <div className={s.practiceGrid}>
          {practices.loading && !practices.data
            ? [0, 1, 2, 3].map((i) => <PracticeCardSkeleton key={i} />)
            : (practices.data ?? []).map((p) => <PracticeCard key={p.id} p={p} />)}
        </div>
      </Card>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <div>
            <h2 className={s.sectionTitle}>Статьи</h2>
            <p className={s.muted}>О чувствах, отношениях и о том, как устроена терапия</p>
          </div>
          <SeeAll href="/app/articles" label="Все статьи" />
        </div>
        {topics.data && topics.data.length > 0 && (
          <div className={s.topics}>
            {topics.data.map((t) => (
              <Link key={t.value} href={`/app/articles?topic=${t.value}`} className={s.topic}>
                {t.label}
              </Link>
            ))}
          </div>
        )}
        <div className={s.articleGrid}>
          {articles.loading && !articles.data
            ? [0, 1, 2].map((i) => <ArticleCardSkeleton key={i} />)
            : (articles.data ?? []).map((a) => <ArticleCard key={a.id} a={a} />)}
        </div>
      </section>
    </WithRail>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={s.seeAll}>
      {label}
      <ChevronRight size={16} strokeWidth={2} aria-hidden />
    </Link>
  );
}
