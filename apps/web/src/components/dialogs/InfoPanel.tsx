"use client";

import { t, tj, intlLocale } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CalendarPlus,
  CalendarX2,
  ChevronDown,
  CircleCheckBig,
  Clock3,
  Download,
  FileText,
  Headset,
  History as HistoryIcon,
  Lock,
  NotebookPen,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Timer,
  Video,
  Wallet,
} from "lucide-react";
import { Badge, Button, useToast } from "@/ui";
import { attachmentUrl } from "@/lib/api/chat";
import { AttachmentViewer, viewKind } from "@/components/chat/AttachmentViewer";
import { dialogsApi, type CallInfo, type DialogDetail, type DialogItem } from "@/lib/api/dialogs";
import { durationLabel } from "@/lib/api/availability";
import { plural, rub, experienceLabel } from "@/lib/format";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { Tisha } from "@/components/chat/Tisha";
import { useDialogActions } from "./DialogActions";
import { PayCall } from "./PayCall";
import { CALL_STATUS, countdown, hm, isLive, range, useNow, weekdayDay } from "./time";
import s from "./dialogs.module.css";

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return t(`{v} КБ`, { v: Math.max(1, Math.round(bytes / 1024)) });
  return t(`{v} МБ`, { v: (bytes / 1024 / 1024).toFixed(1).replace(".", ",") });
}

const SUMMARY_KEY = "aprosop.dialog.summary";

function readOpen(): boolean {
  try {
    return localStorage.getItem(SUMMARY_KEY) === "1";
  } catch {
    return false;
  }
}

// ── In-thread summary: next call + actions, collapsible ─────────────────────

/**
 * Compact strip under the dialogue header: the next call with a countdown and the
 * main action (join / pay / book). Expands to reschedule, cancel, proposals.
 */
export function DialogSummary({ item, detail }: { item: DialogItem; detail: DialogDetail | null }) {
  const ctx = useDialogActions();
  const now = useNow(1000);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(readOpen()), []);
  const toggle = () =>
    setOpen((v) => {
      try {
        localStorage.setItem(SUMMARY_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });

  const call = (detail?.next_call ?? item.next_call) as CallInfo | null;
  const role = detail?.my_role ?? item.my_role;
  const pending = detail?.proposals.filter((p) => p.status === "pending") ?? [];
  const live = !!call && isLive(call);
  const canBook = role === "client" ? !!detail?.can_book : !!detail?.can_propose;
  const bookLabel = role === "client" ? t("Назначить созвон") : t("Предложить время");
  const onBook = ctx ? (role === "client" ? ctx.openBook : ctx.openPropose) : undefined;

  let kicker: string;
  let main: string;
  if (call) {
    kicker = live ? t("Созвон идёт") : call.status === "awaiting_payment" ? t("Созвон ждёт оплаты") : t("Ближайший созвон");
    if (call.is_intro) kicker = live ? t("Знакомство идёт") : call.status === "awaiting_payment" ? t("Знакомство ждёт оплаты") : t("Знакомство, 15\u00a0минут");
    main = live
      ? range(call.scheduled_at, call.duration_minutes)
      : `${weekdayDay(call.scheduled_at)}, ${range(call.scheduled_at, call.duration_minutes)}`;
  } else if (pending.length) {
    kicker = role === "client" ? t("Специалист предлагает время") : t("Вы\u00a0предложили время");
    main = `${weekdayDay(pending[0].scheduled_at)}, ${range(pending[0].scheduled_at, pending[0].duration_minutes)}`;
  } else {
    kicker = t("Созвон не\u00a0назначен");
    main = role === "client" ? t("Выберите время из\u00a0расписания специалиста") : t("Предложите клиенту время из\u00a0расписания");
  }

  let action: React.ReactNode = null;
  if (call && (call.can_join || live)) {
    action = (
      <Button
        variant={live ? "white" : "primary"}
        size="sm"
        href={call.can_join ? `/room/${call.id}` : undefined}
        disabled={!call.can_join}
        icon={<Video size={16} strokeWidth={1.8} />}
      >
        {t("Присоединиться")}
      </Button>
    );
  } else if (call?.status === "awaiting_payment" && role === "client" && ctx) {
    action = (
      <Button variant="primary" size="sm" icon={<Wallet size={16} strokeWidth={1.8} />} onClick={() => ctx.openPay(call)}>
        {t("Оплатить")}
      </Button>
    );
  } else if (call) {
    action = (
      <span className={s.sumCountdown}>
        <Clock3 size={14} strokeWidth={2} aria-hidden />
        {countdown(call.scheduled_at, call.duration_minutes, now)}
      </span>
    );
  } else if (pending.length && role === "client" && ctx) {
    action = (
      <Button variant="primary" size="sm" loading={ctx.busy === pending[0].id} onClick={() => ctx.accept(pending[0])}>
        {t("Принять")}
      </Button>
    );
  } else if (onBook && canBook) {
    action = (
      <Button variant="soft" size="sm" icon={<CalendarPlus size={16} strokeWidth={1.8} />} onClick={onBook}>
        <span className={s.sumActionLabel}>{bookLabel}</span>
      </Button>
    );
  }

  const expandable = !!detail && (!!call || pending.length > 0);

  return (
    <section
      className={s.sum}
      data-tone={live ? "live" : call ? "call" : "empty"}
      data-open={open && expandable ? "" : undefined}
      aria-label={t("Созвоны в\u00a0диалоге")}
    >
      <div className={s.sumRow}>
        <span className={s.sumIcon} aria-hidden>
          {live ? <Video size={18} strokeWidth={1.8} /> : call ? <Clock3 size={18} strokeWidth={1.8} /> : pending.length ? <Sparkles size={18} strokeWidth={1.8} /> : <CalendarPlus size={18} strokeWidth={1.8} />}
        </span>
        <div className={s.sumText}>
          <div className={s.sumKicker}>
            {live && <span className={s.liveDot} aria-hidden />}
            {kicker}
          </div>
          <div className={s.sumMain}>{main}</div>
        </div>
        {action}
        {expandable && (
          <button
            type="button"
            className={s.sumToggle}
            onClick={toggle}
            aria-expanded={open}
            aria-label={open ? t("Свернуть") : t("Подробнее о\u00a0созвоне")}
          >
            <ChevronDown size={18} strokeWidth={2} />
          </button>
        )}
      </div>

      {expandable && detail && (
        <div className={s.sumMore} aria-hidden={!open}>
          <div className={s.sumMoreInner}>
            {call && (
              <>
                <div className={s.sumMeta}>
                  {durationLabel(call.duration_minutes)}, {rub(call.amount_rub)}
                  {CALL_STATUS[call.status] && !live ? ` · ${CALL_STATUS[call.status].label.toLowerCase()}` : ""}
                  {!live && !call.can_join && call.status !== "awaiting_payment" ? t(" · вход откроется за\u00a010\u00a0минут до\u00a0начала") : ""}
                </div>
                {call.status === "awaiting_payment" && role === "client" && !ctx && (
                  <PayCall sessionId={call.id} amountRub={call.amount_rub} paymentUrl={call.payment_url} onPaid={() => undefined} />
                )}
              </>
            )}
            {pending.length > 0 && (
              <div className={s.rows}>
                {pending.map((p) => (
                  <div key={p.id} className={s.proposal}>
                    <Sparkles size={16} strokeWidth={1.8} aria-hidden />
                    <span>
                      {role === "specialist" ? t("Предложено: ") : t("Предлагает: ")}
                      {weekdayDay(p.scheduled_at)}, {range(p.scheduled_at, p.duration_minutes)}
                    </span>
                    {ctx &&
                      (role === "client" ? (
                        <Button size="sm" variant="primary" loading={ctx.busy === p.id} onClick={() => ctx.accept(p)} tabIndex={open ? undefined : -1}>
                          {t("Принять")}
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={ctx.busy === p.id} onClick={() => ctx.closeProposal(p)} tabIndex={open ? undefined : -1}>
                          {t("Отозвать")}
                        </Button>
                      ))}
                  </div>
                ))}
              </div>
            )}
            {ctx && (
              <div className={s.sumLinks}>
                {call?.can_reschedule && (
                  <button type="button" className={s.sumLink} onClick={() => ctx.openReschedule(call)} tabIndex={open ? undefined : -1}>
                    {t("Перенести")}
                  </button>
                )}
                {call?.can_cancel && (
                  <button type="button" className={s.sumLink} onClick={() => ctx.openCancel(call)} tabIndex={open ? undefined : -1}>
                    {t("Отменить")}
                  </button>
                )}
                {canBook && onBook && (
                  <button type="button" className={s.sumLink} onClick={onBook} tabIndex={open ? undefined : -1}>
                    <CalendarPlus size={14} strokeWidth={2} aria-hidden /> {call ? (role === "client" ? t("Ещё созвон") : t("Предложить ещё")) : bookLabel}
                  </button>
                )}
              </div>
            )}
            {role === "client" && call && !live && (
              <div className={s.sumRule}>{tj("Бесплатно отменить или\u00a0перенести можно за {free_cancel_hours} ч\u00a0до\u00a0начала.", { free_cancel_hours: detail.rules.free_cancel_hours })}</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Details sheet: person, call history, files, notes ───────────────────────

export type DetailsFocus = "top" | "notes" | "history";

/** Content of the «О диалоге» sheet that slides over the thread. */
export function DialogDetails({ item, detail, focus }: { item: DialogItem; detail: DialogDetail | null; focus?: DetailsFocus }) {
  const notesRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = focus === "notes" ? notesRef.current : focus === "history" ? historyRef.current : null;
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
    if (focus === "notes") el.querySelector("textarea")?.focus({ preventScroll: true });
  }, [focus]);

  if (item.kind !== "specialist") return <PinnedInfo item={item} />;
  return (
    <>
      <Person item={detail ?? item} />
      {detail && <PrimaryAction detail={detail} />}
      {detail && (
        <div ref={historyRef}>
          <History detail={detail} />
        </div>
      )}
      {detail && <Files detail={detail} />}
      {detail?.my_role === "specialist" && (
        <div ref={notesRef}>
          <Notes id={detail.id} />
        </div>
      )}
      <Privacy item={detail ?? item} />
    </>
  );
}

function Person({ item }: { item: DialogItem | DialogDetail }) {
  const who = item.counterpart;
  const calls = item.calls_count;
  if (who.type === "specialist") {
    return (
      <div className={s.person}>
        <SpecialistPhoto url={who.photo_url ?? null} name={who.name} size={64} alt={t(`Фото: {name}`, { name: who.name })} />
        <div className={s.personBody}>
          <div className={s.personName}>{who.name}</div>
          <div className={s.personSub}>
            {t("Психолог")}{who.experience_years ? `, ${experienceLabel(who.experience_years, t("опыт"))}` : ""}
          </div>
          {!!who.specializations?.length && (
            <div className={s.chips}>
              {who.specializations.slice(0, 4).map((x) => (
                <span key={x} className={s.chip}>
                  {t(x)}
                </span>
              ))}
            </div>
          )}
          {who.psychologist_id && (
            <Link href={`/app/specialists/${who.psychologist_id}`} className={s.personLink}>
              {t("Открыть профиль")}
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={s.person}>
      <AvatarThumb config={who.avatar_config} seed={who.name} size={64} />
      <div className={s.personBody}>
        <div className={s.personName}>{who.name}</div>
        <div className={s.personSub}>
          {t("Анонимный клиент")}{calls ? `, ${calls} ${plural(calls, "созвон", "созвона", "созвонов")}` : ""}
        </div>
      </div>
    </div>
  );
}

function History({ detail }: { detail: DialogDetail }) {
  const past = detail.calls.filter((c) => c.id !== detail.next_call?.id);
  return (
    <section className={s.section}>
      <div className={s.sectionTitle}>
        <span className={s.sectionName}>
          <HistoryIcon size={15} strokeWidth={1.9} aria-hidden />{" "}{t("История созвонов")}
        </span>
      </div>
      {past.length === 0 ? (
        <p className={s.muted}>{t("Здесь появятся прошедшие и\u00a0отменённые созвоны.")}</p>
      ) : (
        <div className={s.rows}>
          {past.slice(0, 12).map((c) => {
            const st = CALL_STATUS[c.status];
            const Icon = c.status === "cancelled" ? CalendarX2 : c.status === "completed" ? CircleCheckBig : Clock3;
            return (
              <div key={c.id} className={s.row}>
                <span className={s.rowIcon} aria-hidden>
                  <Icon size={16} strokeWidth={1.8} />
                </span>
                <span className={s.rowMain}>
                  <span className={s.rowTitle} style={{ display: "block" }}>
                    {weekdayDay(c.scheduled_at)}, {hm(c.scheduled_at)}
                  </span>
                  <span className={s.rowSub}>
                    {c.status === "completed" && c.actual_minutes ? t(`{actual_minutes} мин из\u00a0{duration_minutes}`, { actual_minutes: c.actual_minutes, duration_minutes: c.duration_minutes }) : durationLabel(c.duration_minutes)}
                  </span>
                </span>
                {st && <Badge tone={st.tone}>{st.label}</Badge>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Files({ detail }: { detail: DialogDetail }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<DialogDetail["files"][number] | null>(null);
  const download = async (id: string, name: string) => {
    setBusy(id);
    try {
      const url = await attachmentUrl(id);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast(t("Не\u00a0получилось скачать файл"), { error: true });
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className={s.section}>
      <div className={s.sectionTitle}>
        <span className={s.sectionName}>
          <Paperclip size={15} strokeWidth={1.9} aria-hidden />{" "}{t("Файлы")}
        </span>
      </div>
      {detail.files.length === 0 ? (
        <p className={s.muted}>
          {detail.my_role === "specialist"
            ? t("Материалы, которые вы\u00a0отправите клиенту в\u00a0диалоге, соберутся здесь.")
            : t("Материалы от\u00a0специалиста соберутся здесь.")}
        </p>
      ) : (
        <div className={s.rows}>
          {detail.files.map((f) => (
            <button
              key={f.message_id}
              type="button"
              className={s.row}
              onClick={() => (viewKind(f.mime, f.name) ? setViewing(f) : download(f.message_id, f.name))}
            >
              <span className={s.rowIcon} aria-hidden>
                {busy === f.message_id ? <Clock3 size={16} /> : <FileText size={16} strokeWidth={1.8} />}
              </span>
              <span className={s.rowMain}>
                <span className={s.rowTitle} style={{ display: "block" }}>
                  {f.name}
                </span>
                <span className={s.rowSub}>
                  {fmtSize(f.size)}, {new Date(f.created_at).toLocaleDateString(intlLocale(), { day: "numeric", month: "short" })}
                </span>
              </span>
              <Download size={16} strokeWidth={1.8} aria-hidden />
            </button>
          ))}
        </div>
      )}
      {viewing && (
        <AttachmentViewer msgId={viewing.message_id} name={viewing.name} mime={viewing.mime} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}

function Notes({ id }: { id: string }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef("");

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    dialogsApi
      .note(id)
      .then((n) => {
        if (!alive) return;
        setText(n.text);
        latest.current = n.text;
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
      // Unsaved typing is flushed, not dropped, when the dialogue changes
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void dialogsApi.saveNote(id, latest.current).catch(() => undefined);
      }
    };
  }, [id]);

  const save = async (value: string) => {
    setState("saving");
    try {
      await dialogsApi.saveNote(id, value);
      if (latest.current === value) setState("saved");
    } catch {
      setState("error");
    }
  };

  return (
    <section className={s.section}>
      <div className={s.sectionTitle}>
        <span className={s.sectionName}>
          <NotebookPen size={15} strokeWidth={1.9} aria-hidden />{" "}{t("Заметки о\u00a0клиенте")}
        </span>
        <span className={s.noteMeta}>
          {state === "saving" ? t("Сохраняем…") : state === "saved" ? t("Сохранено") : state === "error" ? t("Не\u00a0сохранилось") : ""}
        </span>
      </div>
      <textarea
        className={s.note}
        value={text}
        disabled={!loaded}
        maxLength={10000}
        placeholder={t("С\u00a0чем\u00a0пришёл клиент, о\u00a0чём договорились, что\u00a0обсудить в\u00a0следующий раз")}
        aria-label={t("Заметки о\u00a0клиенте")}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          latest.current = v;
          setState("idle");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            void save(v);
          }, 900);
        }}
        onBlur={() => {
          if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
            void save(latest.current);
          }
        }}
      />
      <span className={s.noteMeta}>
        <Lock size={12} strokeWidth={2} aria-hidden style={{ verticalAlign: -1 }} />{" "}{t("Видны только вам, хранятся в\u00a0зашифрованном виде")}
      </span>
    </section>
  );
}

function Privacy({ item }: { item: DialogItem | DialogDetail }) {
  const retention =
    item.retention === "1h" ? t("Новые сообщения исчезают через 1\u00a0час") : item.retention === "24h" ? t("Новые сообщения исчезают через 1\u00a0день") : t("Выключены: переписка хранится, пока её\u00a0не\u00a0удалят");
  const who = item.my_role === "client" ? t("Меняется в\u00a0меню\u00a0⋮ над\u00a0перепиской") : t("Режим выбирает клиент");
  return (
    <section className={s.section}>
      <div className={s.sectionTitle}>
        <span className={s.sectionName}>
          <Lock size={15} strokeWidth={1.9} aria-hidden />{" "}{t("Приватность")}
        </span>
      </div>
      <div className={s.rows}>
        <div className={s.row}>
          <span className={s.rowIcon} aria-hidden>
            <Timer size={16} strokeWidth={1.8} />
          </span>
          <span className={s.rowMain}>
            <span className={s.rowTitle} style={{ display: "block" }}>{t("Исчезающие сообщения")}</span>
            <span className={s.rowSub}>
              {retention}. {who}.
            </span>
          </span>
        </div>
        <div className={s.row}>
          <span className={s.rowIcon} aria-hidden>
            <ShieldCheck size={16} strokeWidth={1.8} />
          </span>
          <span className={s.rowMain}>
            <span className={s.rowTitle} style={{ display: "block" }}>{t("Переписка зашифрована")}</span>
            <span className={s.rowSub}>{t("Сотрудники платформы не\u00a0читают диалоги")}</span>
          </span>
        </div>
      </div>
    </section>
  );
}

/** The one main thing to do next in this dialogue, first in the sheet. */
function PrimaryAction({ detail }: { detail: DialogDetail }) {
  const ctx = useDialogActions();
  if (!ctx) return null;
  const client = detail.my_role === "client";
  const can = client ? detail.can_book : detail.can_propose;
  if (!can) return null;
  return (
    <div style={{ flex: "none" }}>
      <Button variant="primary" block icon={<CalendarPlus size={18} strokeWidth={1.8} />} onClick={client ? ctx.openBook : ctx.openPropose}>
        {client ? t("Назначить созвон") : t("Предложить время")}
      </Button>
    </div>
  );
}

function PinnedInfo({ item }: { item: DialogItem }) {
  const isAI = item.kind === "ai";
  return (
    <>
      <div className={s.person}>
        {isAI ? (
          <Tisha size={64} state="idle" />
        ) : (
          <span className={s.rowIcon} style={{ width: 64, height: 64, borderRadius: "50%" }}>
            <Headset size={28} strokeWidth={1.6} />
          </span>
        )}
        <div className={s.personBody}>
          <div className={s.personName}>{item.counterpart.name}</div>
          <div className={s.personSub}>{isAI ? t("ИИ-помощник, не\u00a0психолог") : t("Отвечаем в\u00a0течение нескольких часов")}</div>
        </div>
      </div>
      <p className={s.muted}>
        {isAI
          ? t("Поможет разобраться в\u00a0чувствах, подскажет практику или\u00a0подготовиться к\u00a0созвону.")
          : t("Оплата, созвоны, работа сервиса. Поддержка не\u00a0видит ваши диалоги со\u00a0специалистами.")}
      </p>
      <Privacy item={item} />
      {!isAI && (
        <Link href="/legal/privacy" className={s.personLink}>
          {t("Политика конфиденциальности")}
        </Link>
      )}
    </>
  );
}
