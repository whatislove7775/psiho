"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  HeartHandshake,
  Hourglass,
  LogOut,
  MessagesSquare,
  Mic,
  Repeat,
  ShieldCheck,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { Badge, Button, Card, CardHead, Modal, Skeleton, useToast } from "@/ui";
import { WithRail } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { TopUpForm } from "@/components/billing/TopUpForm";
import { Together } from "@/components/illustrations";
import { GroupChat } from "@/components/circles/GroupChat";
import { SeatsMeter, cx, meetingsLine, topicClass } from "@/components/circles/bits";
import { ApiError } from "@/lib/api/client";
import { billingApi, isInsufficient, notifyBalanceChanged, type BalanceSummary } from "@/lib/api/billing";
import {
  STATUS_LABEL,
  STATUS_TONE,
  TOPIC_TONE,
  circlesApi,
  rubK0,
  type CircleDetail,
  type CircleMeeting,
} from "@/lib/api/circles";
import { day, dayLabel, dayShort, plural, time, untilLabel, experienceLabel } from "@/lib/format";
import s from "@/components/circles/circles.module.css";
import { typo } from "@/lib/typography";

export default function CirclePage() {
  const { id } = useParams<{ id: string }>();
  const circle = useLoad(() => circlesApi.get(id), [id]);
  const c = circle.data;

  if (circle.error) return <ErrorBlock message={circle.error} onRetry={circle.reload} />;
  if (!c) return <Skeleton height={420} radius={28} />;

  const member = c.my_role === "member";
  const next = c.meetings.find((m) => m.status === "live" || (m.status === "scheduled" && Date.parse(m.ends_at) > Date.now()));

  return (
    <div className={topicClass(c.topic)} style={{ display: "contents" }}>
      <Link href="/app/circles" className={s.hostLink} style={{ marginTop: 0 }}>
        <ArrowLeft size={16} style={{ marginRight: 6 }} /> Все круги
      </Link>
      <section className={cx(s.hero, topicClass(c.topic))}>
        <Together className={s.heroArt} />
        <div className={s.heroInner}>
          <div className={s.heroTags}>
            <Badge tone={TOPIC_TONE[c.topic]}>{c.topic_label}</Badge>
            <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
            {member && <Badge tone="success">Вы&nbsp;в&nbsp;круге</Badge>}
          </div>
          <h1 className={s.heroTitle}>{c.title}</h1>
          <p className={s.heroLead}>{typo(c.description)}</p>
          <div className={s.heroFacts}>
            {c.first_meeting_at && (
              <span>
                <CalendarDays size={16} /> {c.format === "single" ? "" : "Начало "}
                {day(c.first_meeting_at)}, {time(c.first_meeting_at)}
              </span>
            )}
            <span>
              {c.format === "single" ? <Clock size={16} /> : <Repeat size={16} />} {meetingsLine(c)}
            </span>
            <span>
              <Users size={16} /> До {c.capacity} участников и&nbsp;{c.cohost ? "двое ведущих" : "ведущий"}
            </span>
          </div>
        </div>
      </section>

      <WithRail rail={<Rail c={c} reload={circle.reload} setData={circle.setData} />}>
        {member && next && <NextMeeting meeting={next} />}
        {!c.my_role && c.me?.status !== "waitlist" && !c.join_closed_reason && (
          <Card className={s.mobileJoin}>
            <div className={s.joinPrice} style={{ fontSize: "var(--t-20)" }}>
              {rubK0(c.price_kopecks)}
              <small>{c.billing === "series" && c.format !== "single" ? "за\u00a0весь цикл" : "за\u00a0встречу"}</small>
            </div>
            <Button variant="primary" href="#join">
              {c.seats_left === 0 ? "В\u00a0лист ожидания" : "Записаться"}
            </Button>
          </Card>
        )}
        {(member || c.my_role === "host" || c.my_role === "cohost") && (
          <Card>
            <CardHead title="Чат круга" icon={<MessagesSquare size={18} />} sub="Здесь можно познакомиться, задать вопрос ведущему и&nbsp;поддержать друг друга" />
            <GroupChat circleId={c.id} hostPhoto={c.host.photo_url} cohostPhoto={c.cohost?.photo_url} />
          </Card>
        )}
        <Card>
          <CardHead title="Расписание" icon={<CalendarDays size={18} />} sub="Время указано по&nbsp;вашему часовому поясу" />
          <Schedule meetings={c.meetings} />
        </Card>
        <Card>
          <CardHead title="Правила круга" icon={<HeartHandshake size={18} />} sub="Их&nbsp;принимает каждый участник&nbsp;— так в&nbsp;круге безопасно" />
          <ul className={s.rules}>
            {c.rules.map((r) => (
              <li key={r}>
                <Check size={16} /> {r}
              </li>
            ))}
          </ul>
        </Card>
        <Card tone="minor">
          <CardHead title="Как&nbsp;проходит встреча" icon={<Video size={16} />} />
          <ul className={s.rules}>
            <li>
              <Check size={16} /> За&nbsp;10&nbsp;минут до&nbsp;начала на&nbsp;этой странице появится кнопка «Войти во&nbsp;встречу».
            </li>
            <li>
              <Check size={16} /> Все участники видят вас как&nbsp;3D-аватар, который повторяет вашу мимику. Изображение с&nbsp;камеры не&nbsp;покидает устройство
              {c.allow_real_faces ? ", а\u00a0показать лицо можно только по\u00a0своему желанию." : "."}
            </li>
            <li>
              <Check size={16} /> Голос можно изменить фильтром ещё до&nbsp;входа. Если захотите что-то сказать, поднимите руку.
            </li>
            <li>
              <Check size={16} /> Встречу ведёт психолог. Он&nbsp;видит вас так&nbsp;же, как&nbsp;все: по&nbsp;псевдониму и&nbsp;в&nbsp;аватаре.
            </li>
          </ul>
        </Card>
      </WithRail>
    </div>
  );
}

function NextMeeting({ meeting }: { meeting: CircleMeeting }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const live = meeting.status === "live" || Date.parse(meeting.starts_at) <= Date.now();
  const open = meeting.room_open || Date.parse(meeting.starts_at) - Date.now() < 10 * 60_000;
  return (
    <Card tone="accent">
      <div className={s.nextMeeting}>
        <div>
          <Badge tone="neutral">{live ? "Встреча идёт" : `Встреча ${meeting.index}`}</Badge>
          <h2 style={{ marginTop: 10 }}>
            {dayLabel(meeting.starts_at)} в {time(meeting.starts_at)}
          </h2>
          <p>{live ? "Можно войти прямо сейчас" : `Начнётся ${untilLabel(meeting.starts_at)}. Комната откроется за\u00a010\u00a0минут.`}</p>
        </div>
        <Button variant="white" size="lg" href={open ? `/circle-room/${meeting.id}` : undefined} disabled={!open} icon={<Video size={18} />}>
          Войти во&nbsp;встречу
        </Button>
      </div>
    </Card>
  );
}

function Schedule({ meetings }: { meetings: CircleMeeting[] }) {
  const nextId = meetings.find((m) => m.status === "live" || (m.status === "scheduled" && Date.parse(m.ends_at) > Date.now()))?.id;
  return (
    <ol className={s.schedule}>
      {meetings.map((m) => {
        const past = m.status === "done" || m.status === "missed" || (m.id !== nextId && Date.parse(m.ends_at) < Date.now());
        return (
          <li key={m.id} className={cx(past && s.schedPast, m.id === nextId && s.schedNext)}>
            <span className={s.schedNum}>{m.index}</span>
            <span className={s.schedWhen}>
              {dayShort(m.starts_at)}, {time(m.starts_at)}–{time(m.ends_at)}
              {m.status === "missed" && <small>Не&nbsp;состоялась, деньги вернулись</small>}
            </span>
            {m.id === nextId ? <Badge tone="primary">Следующая</Badge> : past ? <Badge>Прошла</Badge> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Rail({ c, reload, setData }: { c: CircleDetail; reload: () => void; setData: (d: CircleDetail) => void }) {
  return (
    <>
      {c.my_role === "host" || c.my_role === "cohost" ? (
        <Card>
          <CardHead title="Это&nbsp;ваш круг" />
          <Button variant="primary" block href={`/pro/circles/${c.id}`}>
            Управлять кругом
          </Button>
        </Card>
      ) : (
        <Membership c={c} reload={reload} setData={setData} />
      )}
      <Card>
        <CardHead title={c.cohost ? "Ведущие" : "Ведущий"} />
        <HostCard h={c.host} />
        {c.cohost && (
          <div style={{ marginTop: 20 }}>
            <HostCard h={c.cohost} role="Ко-терапевт" />
          </div>
        )}
      </Card>
    </>
  );
}

function HostCard({ h, role }: { h: CircleDetail["host"]; role?: string }) {
  return (
    <div className={s.hostCard}>
      <SpecialistPhoto url={h.photo_url} name={h.name} size={role ? 60 : 72} />
      <div>
        <h3>{h.name}</h3>
        <div className={s.hostMeta}>
          <Badge tone="success">
            <BadgeCheck size={12} /> {role ?? "Проверенный психолог"}
          </Badge>
          {h.experience_years > 0 && (
            <Badge>
              {experienceLabel(h.experience_years)}
            </Badge>
          )}
          {!!h.verified_credentials && (
            <Badge tone="mint">
              {h.verified_credentials} {plural(h.verified_credentials, "документ", "документа", "документов")}
            </Badge>
          )}
        </div>
        {role && !!h.credentials_top?.length && (
          <ul className={s.credList}>
            {h.credentials_top.map((x) => (
              <li key={`${x.kind}-${x.title}`}>
                {x.title}
                {x.year ? `, ${x.year}` : ""}
              </li>
            ))}
          </ul>
        )}
        {h.bio && <p>{typo(h.bio)}</p>}
        <Link className={s.hostLink} href={`/app/specialists/${h.id}`}>
          Профиль и&nbsp;дипломы
        </Link>
      </div>
    </div>
  );
}

function Membership({ c, reload, setData }: { c: CircleDetail; reload: () => void; setData: (d: CircleDetail) => void }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [leave, setLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topup, setTopup] = useState<{ summary: BalanceSummary; shortfall: number } | null>(null);
  const me = c.me && (c.me.status === "active" || c.me.status === "waitlist") ? c.me : null;
  const full = c.seats_left === 0;
  const freeHours = c.cancel_rules.free_cancel_hours;

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await circlesApi.join(c.id);
      setData(r.circle);
      setConfirm(false);
      notifyBalanceChanged();
      toast(r.waitlisted ? "Вы\u00a0в\u00a0листе ожидания. Как\u00a0только освободится место, запишем автоматически." : `Вы\u00a0в\u00a0круге как\u00a0${r.circle.me?.pseudonym}`);
    } catch (e) {
      if (isInsufficient(e)) {
        const summary = await billingApi.summary().catch(() => null);
        if (summary) setTopup({ summary, shortfall: Math.max(10000, c.amount_due_kopecks - summary.balance_kopecks) });
        else setError(e instanceof ApiError ? e.message : "Не\u00a0хватает денег на\u00a0балансе.");
      } else setError(e instanceof ApiError ? e.message : "Не\u00a0получилось записаться. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const doLeave = async () => {
    setBusy(true);
    try {
      setData(await circlesApi.leave(c.id));
      setLeave(false);
      notifyBalanceChanged();
      toast("Вы\u00a0вышли из\u00a0круга");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не\u00a0получилось выйти.", { error: true });
    } finally {
      setBusy(false);
    }
  };

  if (me) {
    const terms = me.leave_terms;
    return (
      <Card>
        <CardHead title={me.status === "waitlist" ? "Вы\u00a0в\u00a0листе ожидания" : "Вы\u00a0в\u00a0круге"} />
        <div className={s.pseudo}>
          <AvatarThumb config={null} seed={me.handle} size={48} />
          <div>
            <b>{me.pseudonym}</b>
            <small>Так вас видят в&nbsp;этом круге</small>
          </div>
        </div>
        <div className={s.joinBox} style={{ marginTop: 12 }}>
          {me.status === "waitlist" ? (
            <p className={s.note}>
              Вы {me.waitlist_position}-й в&nbsp;очереди. Когда освободится место, мы&nbsp;запишем вас и&nbsp;заморозим оплату с&nbsp;баланса.
              {me.promote_failed && " В\u00a0прошлый раз на\u00a0балансе не\u00a0хватило денег\u00a0— пополните его, чтобы не\u00a0пропустить место."}
            </p>
          ) : (
            me.payments && (
              <dl className={s.kv}>
                <dt>Заморожено под&nbsp;встречи</dt>
                <dd>{rubK0(me.payments.held_kopecks)}</dd>
                <dt>Оплачено</dt>
                <dd>{rubK0(me.payments.paid_kopecks)}</dd>
                {me.payments.returned_kopecks > 0 && (
                  <>
                    <dt>Возвращено</dt>
                    <dd>{rubK0(me.payments.returned_kopecks)}</dd>
                  </>
                )}
              </dl>
            )
          )}
          {me.chat_muted && <p className={s.fine}>Ведущий временно выключил вам сообщения в&nbsp;чате.</p>}
          <Button variant="ghost" icon={<LogOut size={16} />} onClick={() => setLeave(true)}>
            {me.status === "waitlist" ? "Выйти из\u00a0очереди" : "Выйти из\u00a0круга"}
          </Button>
        </div>
        <Modal open={leave} onClose={() => setLeave(false)} title="Выйти из&nbsp;круга?">
          <div className={s.joinBox}>
            {me.status === "waitlist" || !terms ? (
              <p className={s.note}>Вы&nbsp;потеряете место в&nbsp;очереди. Денег за&nbsp;ожидание мы&nbsp;не&nbsp;замораживали.</p>
            ) : (
              <>
                <p className={s.note}>
                  Правила те&nbsp;же, что&nbsp;у&nbsp;созвонов: встречи, до&nbsp;которых больше {freeHours} {plural(freeHours, "часа", "часов", "часов")}, возвращаются
                  полностью, за&nbsp;более близкую&nbsp;— удерживается {c.cancel_rules.late_cancel_penalty_percent}%.
                </p>
                <dl className={s.kv}>
                  <dt>Вернётся на&nbsp;баланс</dt>
                  <dd>{rubK0(terms.refund_kopecks)}</dd>
                  {terms.penalty_kopecks > 0 && (
                    <>
                      <dt>Удержим за&nbsp;позднюю отмену</dt>
                      <dd>{rubK0(terms.penalty_kopecks)}</dd>
                    </>
                  )}
                  {terms.kept_kopecks > 0 && (
                    <>
                      <dt>Уже идущая или&nbsp;начатая часть</dt>
                      <dd>{rubK0(terms.kept_kopecks)}</dd>
                    </>
                  )}
                </dl>
                <p className={s.fine}>Ваш псевдоним и&nbsp;сообщения останутся в&nbsp;чате, но&nbsp;писать и&nbsp;заходить на&nbsp;встречи вы&nbsp;больше не&nbsp;сможете.</p>
              </>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={() => setLeave(false)}>
                Остаться
              </Button>
              <Button variant="danger" loading={busy} onClick={doLeave}>
                Выйти
              </Button>
            </div>
          </div>
        </Modal>
      </Card>
    );
  }

  const removed = c.me?.status === "removed";
  const closed = c.join_closed_reason || (removed ? "Ведущий исключил вас из\u00a0этого круга." : null);
  return (
    <Card>
      <div className={s.joinBox} id="join">
        <div className={s.joinPrice}>
          {rubK0(c.price_kopecks)}
          <small>
            {c.billing === "series" && c.format !== "single"
              ? `за\u00a0весь цикл из\u00a0${c.meetings_count} ${plural(c.meetings_count, "встречи", "встреч", "встреч")}`
              : c.format === "single"
                ? "за\u00a0встречу"
                : `за\u00a0встречу, всего ${rubK0(c.total_kopecks)} за\u00a0${c.meetings_count} ${plural(c.meetings_count, "встречу", "встречи", "встреч")}`}
          </small>
        </div>
        <SeatsMeter capacity={c.capacity} taken={c.seats_taken} />
        {closed ? (
          <p className={s.note}>{closed}</p>
        ) : (
          <Button variant="primary" size="lg" block onClick={() => setConfirm(true)} icon={full ? <Hourglass size={18} /> : undefined}>
            {full ? "Встать в\u00a0лист ожидания" : "Записаться"}
          </Button>
        )}
        <p className={s.fine}>
          Оплата с&nbsp;анонимного баланса. Отмена бесплатно не&nbsp;позже чем&nbsp;за {freeHours} {plural(freeHours, "час", "часа", "часов")} до&nbsp;встречи.
        </p>
      </div>
      <Modal open={confirm} onClose={() => { setConfirm(false); setTopup(null); }} title={full ? "Лист ожидания" : "Записаться в\u00a0круг"} width={520}>
        {topup ? (
          <div className={s.joinBox}>
            <p className={s.note}>
              <Wallet size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
              На&nbsp;балансе не&nbsp;хватает {rubK0(topup.shortfall)}. Пополните баланс&nbsp;— после оплаты вернётесь на&nbsp;эту страницу и&nbsp;запишетесь.
            </p>
            <TopUpForm settings={topup.summary.topup} suggestRub={topup.shortfall / 100} returnTo={`/app/circles/${c.id}`} onDone={() => { setTopup(null); reload(); }} />
          </div>
        ) : (
          <div className={s.joinBox}>
            <div className={s.pseudo}>
              <AvatarThumb config={null} seed={`preview-${c.id}`} size={48} />
              <div>
                <b>Вы&nbsp;получите новое имя</b>
                <small>Например, «Участник-Лиса». Ваш аккаунт никто в&nbsp;круге не&nbsp;увидит.</small>
              </div>
            </div>
            <ul className={s.rules}>
              <li>
                <ShieldCheck size={16} /> На&nbsp;встречах&nbsp;— только аватар, камера не&nbsp;показывает ваше лицо
              </li>
              <li>
                <Mic size={16} /> Голос можно изменить фильтром
              </li>
              <li>
                <Check size={16} /> Вы&nbsp;принимаете правила круга
              </li>
            </ul>
            {full ? (
              <p className={s.note}>
                Сейчас все места заняты. Когда кто-то выйдет, мы&nbsp;запишем вас автоматически и&nbsp;заморозим оплату с&nbsp;баланса&nbsp;— если её&nbsp;хватит.
              </p>
            ) : (
              <dl className={s.kv}>
                <dt>Заморозим на&nbsp;балансе сейчас</dt>
                <dd>{rubK0(c.amount_due_kopecks)}</dd>
                <dt>Списание</dt>
                <dd>{c.billing === "series" ? "после первой встречи" : "после каждой встречи"}</dd>
              </dl>
            )}
            {error && (
              <p className={s.note} role="alert" style={{ color: "var(--c-danger)" }}>
                {error}
              </p>
            )}
            <Button variant="primary" size="lg" block loading={busy} onClick={join}>
              {full ? "Встать в\u00a0очередь" : `Записаться за\u00a0${rubK0(c.amount_due_kopecks)}`}
            </Button>
          </div>
        )}
      </Modal>
    </Card>
  );
}
