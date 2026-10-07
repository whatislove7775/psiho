"use client";

import { t, tj } from "@/lib/i18n";
import { ageLabel, tenureShort } from "@/lib/specialistFacts";
import { useParams } from "next/navigation";
import { ArrowLeft, BadgeCheck, MessageCircle, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/ui";
import { dialogsApi } from "@/lib/api/dialogs";
import { countryList } from "@/components/i18n/CountryChips";
import { useApprox } from "@/lib/i18n/currency";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/ui";
import { WithRail } from "@/components/shell/AppShell";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { ApiError } from "@/lib/api/client";
import { psychologistsApi } from "@/lib/api/endpoints";
import { rub, yearsLabel } from "@/lib/format";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { BookingPanel } from "@/components/booking/BookingPanel";
import { durationLabel } from "@/lib/api/availability";
import { IntroChip } from "@/components/matching/IntroChip";
import s from "@/app/app/specialists/[id]/profile.module.css";
import { useAuth } from "@/lib/auth/store";
import { lp } from "@/lib/i18n";
import { EmptyArt } from "@/components/illustrations";
import {
  PublicCredentials,
  VerifiedBadge,
} from "@/components/credentials/PublicCredentials";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import { RatingPill } from "@/components/reviews/ReviewBits";
import { typo } from "@/lib/typography";

export function SpecialistProfile({
  publicMode = false,
}: {
  publicMode?: boolean;
}) {
  const user = useAuth((st) => st.user);
  const listHref = publicMode ? lp("/specialists") : "/app/specialists";
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const approx = useApprox();
  const id = Number(params?.id);
  const psy = useLoad(async () => {
    if (!Number.isFinite(id)) throw new ApiError(404, "not found");
    return psychologistsApi.get(id);
  }, [id]);

  const back = (
    <Button
      variant="ghost"
      size="sm"
      href={listHref}
      icon={<ArrowLeft size={18} strokeWidth={1.8} />}
      className={s.back}
    >
      {t("Все специалисты")}
    </Button>
  );

  if (psy.error) {
    return (
      <>
        {back}
        {/404|not found|не найден/i.test(psy.error) ? (
          <Card>
            <EmptyState
              art={<EmptyArt scene="cozy" />}
              icon={<UserX size={24} strokeWidth={1.8} />}
              title={t("Специалист сейчас не\u00a0принимает")}
              text={t(
                "Возможно, профиль скрыт или\u00a0ссылка устарела. Выберите другого психолога из\u00a0списка.",
              )}
              action={
                <Button variant="primary" href={listHref}>
                  {t("Посмотреть специалистов")}
                </Button>
              }
            />
          </Card>
        ) : (
          <ErrorBlock message={psy.error} onRetry={psy.reload} />
        )}
      </>
    );
  }

  const p = psy.data;

  return (
    <>
      {back}
      <WithRail
        rail={
          p ? (
            <BookingPanel psy={p} />
          ) : (
            <Card>
              <Skeleton height={24} width="60%" />
              <div style={{ height: 16 }} />
              <Skeleton height={44} radius={999} />
              <div style={{ height: 16 }} />
              <Skeleton height={160} radius={16} />
            </Card>
          )
        }
      >
        <Card as="article" className={s.hero}>
          {p ? (
            <>
              <SpecialistPhoto
                url={p.photo_url}
                name={p.display_name}
                size={168}
                rounded={false}
                alt={t(`Фото: {display_name}`, {
                  display_name: p.display_name,
                })}
              />
              <div className={s.heroText}>
                <div className={s.trust}>
                  {p.verified_credentials ? (
                    <VerifiedBadge count={p.verified_credentials} />
                  ) : (
                    <Badge tone="success">
                      <BadgeCheck size={14} strokeWidth={2} aria-hidden />{" "}
                      {t("Анкета проверена")}
                    </Badge>
                  )}
                  <RatingPill
                    rating={p.rating}
                    count={p.reviews_count}
                    href="#reviews"
                  />
                  <IntroChip psy={p} withPrice />
                </div>
                <h1 className={s.name}>{p.display_name}</h1>
                <p className={s.bio}>{typo(p.bio)}</p>
                <dl className={s.facts}>
                  <div>
                    <dt>{t("Опыт")}</dt>
                    <dd>{yearsLabel(p.experience_years)}</dd>
                  </div>
                  {ageLabel(p.age) && (
                    <div>
                      <dt>{t("Возраст")}</dt>
                      <dd>{ageLabel(p.age)}</dd>
                    </div>
                  )}
                  {tenureShort(p.on_service_since) && (
                    <div>
                      <dt>{t("На\u00a0сервисе")}</dt>
                      <dd>{tenureShort(p.on_service_since)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{t("Созвон")}</dt>
                    <dd>
                      {p.booking &&
                      p.booking.min_duration !== p.booking.max_duration
                        ? `${durationLabel(p.booking.min_duration)} – ${durationLabel(p.booking.max_duration)}`
                        : durationLabel(p.booking?.min_duration ?? 50)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Стоимость")}</dt>
                    <dd>
                      {p.booking
                        ? t(`{rub} за\u00a0час`, {
                            rub: rub(p.booking.hourly_rate_rub),
                          })
                        : rub(p.session_rate_rub)}
                      {approx?.(
                        p.booking?.hourly_rate_rub ?? p.session_rate_rub,
                      ) && (
                        <small className={s.approx}>
                          {" "}
                          {approx(
                            p.booking?.hourly_rate_rub ?? p.session_rate_rub,
                          )}
                        </small>
                      )}
                    </dd>
                  </div>
                </dl>
                <div className={s.ctaRow}>
                  <Button
                    variant="primary"
                    loading={starting}
                    icon={<MessageCircle size={18} strokeWidth={1.8} />}
                    onClick={async () => {
                      if (!user) {
                        router.push(
                          `${lp("/start")}?next=${encodeURIComponent(`/app/specialists/${p.id}`)}`,
                        );
                        return;
                      }
                      setStarting(true);
                      try {
                        const d = await dialogsApi.startWithSpecialist(p.id);
                        router.push(
                          `/app/dialogs?d=${encodeURIComponent(d.id)}`,
                        );
                      } catch (e) {
                        toast(
                          e instanceof ApiError
                            ? e.message
                            : t("Не\u00a0получилось начать диалог"),
                          { error: true },
                        );
                        setStarting(false);
                      }
                    }}
                  >
                    {t("Начать диалог")}
                  </Button>
                  <Button
                    variant="secondary"
                    href="#booking"
                    className={s.jump}
                  >
                    {t("Выбрать время")}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <Skeleton width={168} height={168} radius={18} />
              <div className={s.heroText}>
                <Skeleton width="30%" height={24} radius={999} />
                <Skeleton width="55%" height={36} />
                <Skeleton width="90%" height={16} />
                <Skeleton width="70%" height={16} />
              </div>
            </>
          )}
        </Card>

        {p && (
          <Card as="section" className={s.details}>
            {p.approach && (
              <div className={s.section}>
                <h2>{t("Подход")}</h2>
                <p>{p.approach}</p>
              </div>
            )}
            <div className={s.section}>
              <h2>{t("С\u00a0чем\u00a0работает")}</h2>
              <div className={s.badges}>
                {p.specializations.map((x) => (
                  <Badge key={x}>{t(x)}</Badge>
                ))}
              </div>
            </div>
            {p.languages.length > 0 && (
              <div className={s.section}>
                <h2>{t("Языки")}</h2>
                <p>{p.languages.map((l) => t(l)).join(", ")}</p>
              </div>
            )}
            {(p.serves_countries?.length || p.licensure) && (
              <div className={s.section}>
                <h2>{t("Страны")}</h2>
                {p.serves_countries?.length ? (
                  <p>
                    {tj("Принимает клиентов из: {list}", {
                      list: countryList(p.serves_countries),
                    })}
                  </p>
                ) : null}
                {p.licensure && (
                  <p>
                    {tj("Право практиковать: {text}", { text: p.licensure })}
                  </p>
                )}
              </div>
            )}
          </Card>
        )}
        {p && <PublicCredentials psychologistId={p.id} />}
        {p && <ReviewsSection psychologistId={p.id} name={p.display_name} />}
      </WithRail>
    </>
  );
}
