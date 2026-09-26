"use client";

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
  Lock,
  Sparkles,
  Timer,
  Video,
  Wallet,
} from "lucide-react";
import { Badge, Button, useToast } from "@/ui";
import { attachmentUrl } from "@/lib/api/chat";
import { dialogsApi, type CallInfo, type DialogDetail, type DialogItem } from "@/lib/api/dialogs";
import { durationLabel } from "@/lib/api/availability";
import { plural, rub } from "@/lib/format";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { Tisha } from "@/components/chat/Tisha";
import { useDialogActions } from "./DialogActions";
import { PayCall } from "./PayCall";
import { CALL_STATUS, countdown, hm, isLive, range, useNow, weekdayDay } from "./time";
import s from "./dialogs.module.css";

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
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
  const bookLabel = role === "client" ? "Назначить созвон" : "Предложить время";
  const onBook = ctx ? (role === "client" ? ctx.openBook : ctx.openPropose) : undefined;

  let kicker: string;
  let main: string;
  if (call) {
    kicker = live ? "Созвон идёт" : call.status === "awaiting_payment" ? "Созвон ждёт оплаты" : "Ближайший созвон";
    if (call.is_intro) kicker = live ? "Знакомство идёт" : call.status === "awaiting_payment" ? "Знакомство ждёт оплаты" : "Знакомство, 15 минут";
    main = live
      ? range(call.scheduled_at, call.duration_minutes)
      : `${weekdayDay(call.scheduled_at)}, ${range(call.scheduled_at, call.duration_minutes)}`;
  } else if (pending.length) {
    kicker = role === "client" ? "Специалист предлагает время" : "Вы предложили время";
    main = `${weekdayDay(pending[0].scheduled_at)}, ${range(pending[0].scheduled_at, pending[0].duration_minutes)}`;
  } else {
    kicker = "Созвон не назначен";
    main = role === "client" ? "Выберите время из расписания специалиста" : "Предложите клиенту время из расписания";
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
        Присоединиться
      </Button>
    );
  } else if (call?.status === "awaiting_payment" && role === "client" && ctx) {
    action = (
      <Button variant="primary" size="sm" icon={<Wallet size={16} strokeWidth={1.8} />} onClick={() => ctx.openPay(call)}>
        Оплатить
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
        Принять
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
      aria-label="Созвоны в диалоге"
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
            aria-label={open ? "Свернуть" : "Подробнее о созвоне"}
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
                  {!live && !call.can_join && call.status !== "awaiting_payment" ? " · вход откроется за 10 минут до начала" : ""}
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
                      {role === "specialist" ? "Предложено: " : "Предлагает: "}
                      {weekdayDay(p.scheduled_at)}, {range(p.scheduled_at, p.duration_minutes)}
                    </span>
                    {ctx &&
                      (role === "client" ? (
                        <Button size="sm" variant="primary" loading={ctx.busy === p.id} onClick={() => ctx.accept(p)} tabIndex={open ? undefined : -1}>
                          Принять
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={ctx.busy === p.id} onClick={() => ctx.closeProposal(p)} tabIndex={open ? undefined : -1}>
                          Отозвать
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
                    Перенести
                  </button>
                )}
                {call?.can_cancel && (
                  <button type="button" className={s.sumLink} onClick={() => ctx.openCancel(call)} tabIndex={open ? undefined : -1}>
                    Отменить
                  </button>
                )}
                {canBook && onBook && (
                  <button type="button" className={s.sumLink} onClick={onBook} tabIndex={open ? undefined : -1}>
                    <CalendarPlus size={14} strokeWidth={2} aria-hidden /> {call ? (role === "client" ? "Ещё созвон" : "Предложить ещё") : bookLabel}
                  </button>
                )}
              </div>
            )}
            {role === "client" && call && !live && (
              <div className={s.sumRule}>Бесплатно отменить или перенести можно за {detail.rules.free_cancel_hours} ч до начала.</div>
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
        <SpecialistPhoto url={who.photo_url ?? null} name={who.name} size={64} alt={`Фото: ${who.name}`} />
        <div className={s.personBody}>
          <div className={s.personName}>{who.name}</div>
          <div className={s.personSub}>
            Психолог{who.experience_years ? `, опыт ${who.experience_years} ${plural(who.experience_years, "год", "года", "лет")}` : ""}
          </div>
          {!!who.specializations?.length && (
            <div className={s.chips}>
              {who.specializations.slice(0, 4).map((x) => (
                <span key={x} className={s.chip}>
                  {x}
                </span>
              ))}
            </div>
          )}
          {who.psychologist_id && (
            <Link href={`/app/specialists/${who.psychologist_id}`} className={s.personLink}>
              Открыть профиль
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
          Анонимный клиент{calls ? `, ${calls} ${plural(calls, "созвон", "созвона", "созвонов")}` : ""}
        </div>
      </div>
    </div>
  );
}

function History({ detail }: { detail: DialogDetail }) {
  const past = detail.calls.filter((c) => c.id !== detail.next_call?.id);
  return (
    <section className={s.section}>
      <div className={s.sectionTitle}>История созвонов</div>
      {past.length === 0 ? (
        <p className={s.muted}>Здесь появятся прошедшие и отменённые созвоны.</p>
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
                    {c.status === "completed" && c.actual_minutes ? `${c.actual_minutes} мин из ${c.duration_minutes}` : durationLabel(c.duration_minutes)}
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
      toast("Не получилось скачать файл", { error: true });
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className={s.section}>
      <div className={s.sectionTitle}>Файлы</div>
      {detail.files.length === 0 ? (
        <p className={s.muted}>
          {detail.my_role === "specialist"
            ? "Материалы, которые вы отправите клиенту в диалоге, соберутся здесь."
            : "Материалы от специалиста соберутся здесь."}
        </p>
      ) : (
        <div className={s.rows}>
          {detail.files.map((f) => (
            <button key={f.message_id} type="button" className={s.row} onClick={() => download(f.message_id, f.name)}>
              <span className={s.rowIcon} aria-hidden>
                {busy === f.message_id ? <Clock3 size={16} /> : <FileText size={16} strokeWidth={1.8} />}
              </span>
              <span className={s.rowMain}>
                <span className={s.rowTitle} style={{ display: "block" }}>
                  {f.name}
                </span>
                <span className={s.rowSub}>
                  {fmtSize(f.size)}, {new Date(f.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </span>
              </span>
              <Download size={16} strokeWidth={1.8} aria-hidden />
            </button>
          ))}
        </div>
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
        <span>Заметки о клиенте</span>
        <span className={s.noteMeta}>
          {state === "saving" ? "Сохраняем…" : state === "saved" ? "Сохранено" : state === "error" ? "Не сохранилось" : ""}
        </span>
      </div>
      <textarea
        className={s.note}
        value={text}
        disabled={!loaded}
        maxLength={10000}
        placeholder="С чем пришёл клиент, о чём договорились, что обсудить в следующий раз"
        aria-label="Заметки о клиенте"
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
        <Lock size={12} strokeWidth={2} aria-hidden style={{ verticalAlign: -1 }} /> Видны только вам, хранятся в
        зашифрованном виде
      </span>
    </section>
  );
}

function Privacy({ item }: { item: DialogItem | DialogDetail }) {
  return (
    <section className={s.section}>
      <div className={s.sectionTitle}>Приватность</div>
      <p className={s.muted}>
        <Timer size={14} strokeWidth={1.8} aria-hidden style={{ verticalAlign: -2 }} />{" "}
        {item.retention === "1h" ? "Исчезающие сообщения: новые исчезают через 1 час." : item.retention === "24h" ? "Исчезающие сообщения: новые исчезают через 1 день." : "Исчезающие сообщения выключены: переписка хранится, пока её не удалят."}{" "}
        {item.my_role === "client" ? "Режим меняется кнопкой над перепиской." : "Режим выбирает клиент."}
      </p>
      <p className={s.muted}>Переписка зашифрована. Сотрудники платформы не имеют доступа к диалогам клиентов и специалистов.</p>
    </section>
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
          <div className={s.personSub}>{isAI ? "ИИ-помощник, не психолог" : "Отвечаем в течение нескольких часов"}</div>
        </div>
      </div>
      <p className={s.muted}>
        {isAI
          ? "Поможет разобраться в чувствах, подскажет практику или подготовиться к созвону."
          : "Оплата, созвоны, работа сервиса. Поддержка не видит ваши диалоги со специалистами."}
      </p>
      <Privacy item={item} />
      {!isAI && (
        <Link href="/legal/privacy" className={s.personLink}>
          Политика конфиденциальности
        </Link>
      )}
    </>
  );
}
