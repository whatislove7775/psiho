"use client";

import { t as tt, tj, tc } from "@/lib/i18n";
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
        <ArrowLeft size={16} style={{ marginRight: 6 }} />{" "}{tt("Все круги")}
      </Link>
      <section className={cx(s.hero, topicClass(c.topic))}>
        <Together className={s.heroArt} />
        <div className={s.heroInner}>
          <div className={s.heroTags}>
            <Badge tone={TOPIC_TONE[c.topic]}>{c.topic_label}</Badge>
            <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
            {member && <Badge tone="success">{tt("Вы\u00a0в\u00a0круге")}</Badge>}
          </div>
          <h1 className={s.heroTitle}>{c.title}</h1>
          <p className={s.heroLead}>{typo(c.description)}</p>
          <div className={s.heroFacts}>
            {c.first_meeting_at && (
              <span>
                <CalendarDays size={16} /> {c.format === "single" ? "" : tt("Начало ")}
                {day(c.first_meeting_at)}, {time(c.first_meeting_at)}
              </span>
            )}
            <span>
              {c.format === "single" ? <Clock size={16} /> : <Repeat size={16} />} {meetingsLine(c)}
            </span>
            <span>
              <Users size={16} />{" "}{tt("До")}{" "}{c.capacity}{" "}{tt("участников и")}{" "}{c.cohost ? tt("двое ведущих") : tt("ведущий")}
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
              <small>{c.billing === "series" && c.format !== "single" ? tt("за\u00a0весь цикл") : tt("за\u00a0встречу")}</small>
            </div>
            <Button variant="primary" href="#join">
              {c.seats_left === 0 ? tt("В\u00a0лист ожидания") : tt("Записаться")}
            </Button>
          </Card>
        )}
        {(member || c.my_role === "host" || c.my_role === "cohost") && (
          <Card>
            <CardHead title={tt("Чат круга")} icon={<MessagesSquare size={18} />} sub={tt("Здесь можно познакомиться, задать вопрос ведущему и\u00a0поддержать друг друга")} />
            <GroupChat circleId={c.id} hostPhoto={c.host.photo_url} cohostPhoto={c.cohost?.photo_url} />
          </Card>
        )}
        <Card>
          <CardHead title={tt("Расписание")} icon={<CalendarDays size={18} />} sub={tt("Время указано по\u00a0вашему часовому поясу")} />
          <Schedule meetings={c.meetings} />
        </Card>
        <Card>
          <CardHead title={tt("Правила круга")} icon={<HeartHandshake size={18} />} sub={tt("Их\u00a0принимает каждый участник\u00a0— так в\u00a0круге безопасно")} />
          <ul className={s.rules}>
            {c.rules.map((r) => (
              <li key={r}>
                <Check size={16} /> {r}
              </li>
            ))}
          </ul>
        </Card>
        <Card tone="minor">
          <CardHead title={tt("Как\u00a0проходит встреча")} icon={<Video size={16} />} />
          <ul className={s.rules}>
            <li>
              <Check size={16} />{" "}{tt("За\u00a010\u00a0минут до\u00a0начала на\u00a0этой странице появится кнопка «Войти во\u00a0встречу».")}
            </li>
            <li>
              <Check size={16} />{" "}{tt("Все участники видят вас как\u00a03D-аватар, который повторяет вашу мимику. Изображение с\u00a0камеры не\u00a0покидает устройство")}
              {c.allow_real_faces ? tt(", а\u00a0показать лицо можно только по\u00a0своему желанию.") : "."}
            </li>
            <li>
              <Check size={16} />{" "}{tt("Голос можно изменить фильтром ещё до\u00a0входа. Если захотите что-то сказать, поднимите руку.")}
            </li>
            <li>
              <Check size={16} />{" "}{tt("Встречу ведёт психолог. Он\u00a0видит вас так\u00a0же, как\u00a0все: по\u00a0псевдониму и\u00a0в\u00a0аватаре.")}
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
          <Badge tone="neutral">{live ? tt("Встреча идёт") : tt(`Встреча {index}`, { index: meeting.index })}</Badge>
          <h2 style={{ marginTop: 10 }}>
            {tj("{dayLabel} в {time}", { dayLabel: dayLabel(meeting.starts_at), time: time(meeting.starts_at) })}
          </h2>
          <p>{live ? tt("Можно войти прямо сейчас") : tt(`Начнётся {untilLabel}. Комната откроется за\u00a010\u00a0минут.`, { untilLabel: untilLabel(meeting.starts_at) })}</p>
        </div>
        <Button variant="white" size="lg" href={open ? `/circle-room/${meeting.id}` : undefined} disabled={!open} icon={<Video size={18} />}>
          {tt("Войти во\u00a0встречу")}
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
              {m.status === "missed" && <small>{tt("Не\u00a0состоялась, деньги вернулись")}</small>}
            </span>
            {m.id === nextId ? <Badge tone="primary">{tt("Следующая")}</Badge> : past ? <Badge>{tt("Прошла")}</Badge> : null}
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
          <CardHead title={tt("Это\u00a0ваш круг")} />
          <Button variant="primary" block href={`/pro/circles/${c.id}`}>
            {tt("Управлять кругом")}
          </Button>
        </Card>
      ) : (
        <Membership c={c} reload={reload} setData={setData} />
      )}
      <Card>
        <CardHead title={c.cohost ? tt("Ведущие") : tt("Ведущий")} />
        <HostCard h={c.host} />
        {c.cohost && (
          <div style={{ marginTop: 20 }}>
            <HostCard h={c.cohost} role={tt("Ко-терапевт")} />
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
            <BadgeCheck size={12} /> {role ?? tt("Проверенный психолог")}
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
          {tt("Профиль и\u00a0дипломы")}
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
      toast(r.waitlisted ? tt("Вы\u00a0в\u00a0листе ожидания. Как\u00a0только освободится место, запишем автоматически.") : tt(`Вы\u00a0в\u00a0круге как\u00a0{pseudonym}`, { pseudonym: r.circle.me?.pseudonym }));
    } catch (e) {
      if (isInsufficient(e)) {
        const summary = await billingApi.summary().catch(() => null);
        if (summary) setTopup({ summary, shortfall: Math.max(10000, c.amount_due_kopecks - summary.balance_kopecks) });
        else setError(e instanceof ApiError ? e.message : tt("Не\u00a0хватает денег на\u00a0балансе."));
      } else setError(e instanceof ApiError ? e.message : tt("Не\u00a0получилось записаться. Попробуйте ещё раз."));
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
      toast(tt("Вы\u00a0вышли из\u00a0круга"));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : tt("Не\u00a0получилось выйти."), { error: true });
    } finally {
      setBusy(false);
    }
  };

  if (me) {
    const terms = me.leave_terms;
    return (
      <Card>
        <CardHead title={me.status === "waitlist" ? tt("Вы\u00a0в\u00a0листе ожидания") : tt("Вы\u00a0в\u00a0круге")} />
        <div className={s.pseudo}>
          <AvatarThumb config={null} seed={me.handle} size={48} />
          <div>
            <b>{me.pseudonym}</b>
            <small>{tt("Так вас видят в\u00a0этом круге")}</small>
          </div>
        </div>
        <div className={s.joinBox} style={{ marginTop: 12 }}>
          {me.status === "waitlist" ? (
            <p className={s.note}>
              {tt("Вы")}{" "}{me.waitlist_position}{tt("-й в\u00a0очереди. Когда освободится место, мы\u00a0запишем вас и\u00a0заморозим оплату с\u00a0баланса.")}
              {me.promote_failed && tt(" В\u00a0прошлый раз на\u00a0балансе не\u00a0хватило денег\u00a0— пополните его, чтобы не\u00a0пропустить место.")}
            </p>
          ) : (
            me.payments && (
              <dl className={s.kv}>
                <dt>{tt("Заморожено под\u00a0встречи")}</dt>
                <dd>{rubK0(me.payments.held_kopecks)}</dd>
                <dt>{tt("Оплачено")}</dt>
                <dd>{rubK0(me.payments.paid_kopecks)}</dd>
                {me.payments.returned_kopecks > 0 && (
                  <>
                    <dt>{tt("Возвращено")}</dt>
                    <dd>{rubK0(me.payments.returned_kopecks)}</dd>
                  </>
                )}
              </dl>
            )
          )}
          {me.chat_muted && <p className={s.fine}>{tt("Ведущий временно выключил вам сообщения в\u00a0чате.")}</p>}
          <Button variant="ghost" icon={<LogOut size={16} />} onClick={() => setLeave(true)}>
            {me.status === "waitlist" ? tt("Выйти из\u00a0очереди") : tt("Выйти из\u00a0круга")}
          </Button>
        </div>
        <Modal open={leave} onClose={() => setLeave(false)} title={tt("Выйти из\u00a0круга?")}>
          <div className={s.joinBox}>
            {me.status === "waitlist" || !terms ? (
              <p className={s.note}>{tt("Вы\u00a0потеряете место в\u00a0очереди. Денег за\u00a0ожидание мы\u00a0не\u00a0замораживали.")}</p>
            ) : (
              <>
                <p className={s.note}>
                  {tt("Правила те\u00a0же, что\u00a0у\u00a0созвонов: встречи, до\u00a0которых больше")}{" "}{freeHours} {plural(freeHours, "часа", "часов", "часов")}{tt(", возвращаются полностью, за\u00a0более близкую\u00a0— удерживается")}{" "}{c.cancel_rules.late_cancel_penalty_percent}%.
                </p>
                <dl className={s.kv}>
                  <dt>{tt("Вернётся на\u00a0баланс")}</dt>
                  <dd>{rubK0(terms.refund_kopecks)}</dd>
                  {terms.penalty_kopecks > 0 && (
                    <>
                      <dt>{tt("Удержим за\u00a0позднюю отмену")}</dt>
                      <dd>{rubK0(terms.penalty_kopecks)}</dd>
                    </>
                  )}
                  {terms.kept_kopecks > 0 && (
                    <>
                      <dt>{tt("Уже идущая или\u00a0начатая часть")}</dt>
                      <dd>{rubK0(terms.kept_kopecks)}</dd>
                    </>
                  )}
                </dl>
                <p className={s.fine}>{tt("Ваш псевдоним и\u00a0сообщения останутся в\u00a0чате, но\u00a0писать и\u00a0заходить на\u00a0встречи вы\u00a0больше не\u00a0сможете.")}</p>
              </>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={() => setLeave(false)}>
                {tt("Остаться")}
              </Button>
              <Button variant="danger" loading={busy} onClick={doLeave}>
                {tc("круг", "Выйти")}
              </Button>
            </div>
          </div>
        </Modal>
      </Card>
    );
  }

  const removed = c.me?.status === "removed";
  const closed = c.join_closed_reason || (removed ? tt("Ведущий исключил вас из\u00a0этого круга.") : null);
  return (
    <Card>
      <div className={s.joinBox} id="join">
        <div className={s.joinPrice}>
          {rubK0(c.price_kopecks)}
          <small>
            {c.billing === "series" && c.format !== "single"
              ? tt(`за\u00a0весь цикл из\u00a0{meetings_count} {plural}`, { meetings_count: c.meetings_count, plural: plural(c.meetings_count, "встречи", "встреч", "встреч") })
              : c.format === "single"
                ? tt("за\u00a0встречу")
                : tt(`за\u00a0встречу, всего {rubK0} за\u00a0{meetings_count} {plural}`, { rubK0: rubK0(c.total_kopecks), meetings_count: c.meetings_count, plural: plural(c.meetings_count, "встречу", "встречи", "встреч") })}
          </small>
        </div>
        <SeatsMeter capacity={c.capacity} taken={c.seats_taken} />
        {closed ? (
          <p className={s.note}>{closed}</p>
        ) : (
          <Button variant="primary" size="lg" block onClick={() => setConfirm(true)} icon={full ? <Hourglass size={18} /> : undefined}>
            {full ? tt("Встать в\u00a0лист ожидания") : tt("Записаться")}
          </Button>
        )}
        <p className={s.fine}>
          {tt("Оплата с\u00a0анонимного баланса. Отмена бесплатно не\u00a0позже чем\u00a0за")}{" "}{freeHours} {plural(freeHours, "час", "часа", "часов")}{" "}{tt("до\u00a0встречи.")}
        </p>
      </div>
      <Modal open={confirm} onClose={() => { setConfirm(false); setTopup(null); }} title={full ? tt("Лист ожидания") : tt("Записаться в\u00a0круг")} width={520}>
        {topup ? (
          <div className={s.joinBox}>
            <p className={s.note}>
              <Wallet size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
              {tt("На\u00a0балансе не\u00a0хватает")}{" "}{rubK0(topup.shortfall)}{tt(". Пополните баланс\u00a0— после оплаты вернётесь на\u00a0эту страницу и\u00a0запишетесь.")}
            </p>
            <TopUpForm settings={topup.summary.topup} suggestRub={topup.shortfall / 100} returnTo={`/app/circles/${c.id}`} onDone={() => { setTopup(null); reload(); }} />
          </div>
        ) : (
          <div className={s.joinBox}>
            <div className={s.pseudo}>
              <AvatarThumb config={null} seed={`preview-${c.id}`} size={48} />
              <div>
                <b>{tt("Вы\u00a0получите новое имя")}</b>
                <small>{tt("Например, «Участник-Лиса». Ваш аккаунт никто в\u00a0круге не\u00a0увидит.")}</small>
              </div>
            </div>
            <ul className={s.rules}>
              <li>
                <ShieldCheck size={16} />{" "}{tt("На\u00a0встречах\u00a0— только аватар, камера не\u00a0показывает ваше лицо")}
              </li>
              <li>
                <Mic size={16} />{" "}{tt("Голос можно изменить фильтром")}
              </li>
              <li>
                <Check size={16} />{" "}{tt("Вы\u00a0принимаете правила круга")}
              </li>
            </ul>
            {full ? (
              <p className={s.note}>
                {tt("Сейчас все места заняты. Когда кто-то выйдет, мы\u00a0запишем вас автоматически и\u00a0заморозим оплату с\u00a0баланса\u00a0— если её\u00a0хватит.")}
              </p>
            ) : (
              <dl className={s.kv}>
                <dt>{tt("Заморозим на\u00a0балансе сейчас")}</dt>
                <dd>{rubK0(c.amount_due_kopecks)}</dd>
                <dt>{tt("Списание")}</dt>
                <dd>{c.billing === "series" ? tt("после первой встречи") : tt("после каждой встречи")}</dd>
              </dl>
            )}
            {error && (
              <p className={s.note} role="alert" style={{ color: "var(--c-danger)" }}>
                {error}
              </p>
            )}
            <Button variant="primary" size="lg" block loading={busy} onClick={join}>
              {full ? tt("Встать в\u00a0очередь") : tt(`Записаться за\u00a0{rubK0}`, { rubK0: rubK0(c.amount_due_kopecks) })}
            </Button>
          </div>
        )}
      </Modal>
    </Card>
  );
}
