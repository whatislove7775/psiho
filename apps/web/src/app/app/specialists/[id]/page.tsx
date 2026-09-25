"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, BadgeCheck, UserX } from "lucide-react";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/ui";
import { WithRail } from "@/components/shell/AppShell";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { ApiError } from "@/lib/api/client";
import { psychologistsApi } from "@/lib/api/endpoints";
import { plural, rub } from "@/lib/format";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { BookingPanel } from "@/components/booking/BookingPanel";
import { durationLabel } from "@/lib/api/availability";
import s from "./profile.module.css";
import { EmptyArt } from "@/components/illustrations";

export default function SpecialistProfile() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const psy = useLoad(async () => {
    if (!Number.isFinite(id)) throw new ApiError(404, "not found");
    return psychologistsApi.get(id);
  }, [id]);

  const back = (
    <Button
      variant="ghost"
      size="sm"
      href="/app/specialists"
      icon={<ArrowLeft size={18} strokeWidth={1.8} />}
      className={s.back}
    >
      Все специалисты
    </Button>
  );

  if (psy.error) {
    return (
      <>
        {back}
        {/404|not found|не найден/i.test(psy.error) ? (
          <Card>
            <EmptyState art={<EmptyArt scene="cozy" />}
              icon={<UserX size={24} strokeWidth={1.8} />}
              title="Специалист сейчас не принимает"
              text="Возможно, профиль скрыт или ссылка устарела. Выберите другого психолога из списка."
              action={
                <Button variant="primary" href="/app/specialists">
                  Посмотреть специалистов
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
                alt={`Фото: ${p.display_name}`}
              />
              <div className={s.heroText}>
                <Badge tone="success">
                  <BadgeCheck size={14} strokeWidth={2} aria-hidden /> Документы
                  проверены
                </Badge>
                <h1 className={s.name}>{p.display_name}</h1>
                <p className={s.bio}>{p.bio}</p>
                <dl className={s.facts}>
                  <div>
                    <dt>Опыт</dt>
                    <dd>
                      {p.experience_years}{" "}
                      {plural(p.experience_years, "год", "года", "лет")}
                    </dd>
                  </div>
                  <div>
                    <dt>Сессия</dt>
                    <dd>
                      {p.booking && p.booking.min_duration !== p.booking.max_duration
                        ? `${durationLabel(p.booking.min_duration)} – ${durationLabel(p.booking.max_duration)}`
                        : durationLabel(p.booking?.min_duration ?? 50)}
                    </dd>
                  </div>
                  <div>
                    <dt>Стоимость</dt>
                    <dd>
                      {p.booking ? `${rub(p.booking.hourly_rate_rub)} за час` : rub(p.session_rate_rub)}
                    </dd>
                  </div>
                </dl>
                <Button variant="primary" href="#booking" className={s.jump}>
                  Выбрать время
                </Button>
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
                <h2>Подход</h2>
                <p>{p.approach}</p>
              </div>
            )}
            <div className={s.section}>
              <h2>С чем работает</h2>
              <div className={s.badges}>
                {p.specializations.map((x) => (
                  <Badge key={x}>{x}</Badge>
                ))}
              </div>
            </div>
            {p.languages.length > 0 && (
              <div className={s.section}>
                <h2>Языки</h2>
                <p>{p.languages.join(", ")}</p>
              </div>
            )}
            <div className={s.section}>
              <h2>Как пройдёт встреча</h2>
              <p>
                Зашифрованная видеосвязь напрямую между вами и специалистом.
                Специалист видит ваш аватар и слышит голос, но не знает, кто вы.
              </p>
            </div>
          </Card>
        )}
      </WithRail>
    </>
  );
}
