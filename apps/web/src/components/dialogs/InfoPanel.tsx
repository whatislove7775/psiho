"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CalendarPlus,
  CalendarX2,
  CircleCheckBig,
  Clock3,
  Download,
  FileText,
  Headset,
  Lock,
  Sparkles,
  Timer,
  Video,
  X,
} from "lucide-react";
import { Badge, Button, Segmented, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { attachmentUrl, type Retention } from "@/lib/api/chat";
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

/** Right panel of a dialogue: who, next call, calls history, files, notes, retention. */
export function InfoPanel({
  item,
  detail,
  onClose,
  onRetention,
}: {
  item: DialogItem | null;
  detail: DialogDetail | null;
  onClose: () => void;
  onRetention: (r: Retention) => void;
}) {
  if (!item) return null;
  if (item.kind !== "specialist") return <PinnedInfo item={item} onClose={onClose} onRetention={onRetention} />;
  return (
    <>
      <div className={s.infoHead}>
        <span className={s.infoHeadTitle}>О диалоге</span>
        <Button variant="ghost" size="sm" iconOnly className={s.infoClose} aria-label="Закрыть" onClick={onClose} icon={<X size={18} />} />
      </div>
      <Person item={detail ?? item} />
      <NextCall detail={detail} />
      {detail && <Proposals detail={detail} />}
      {detail && <History detail={detail} />}
      {detail && <Files detail={detail} />}
      {detail?.my_role === "specialist" && <Notes id={detail.id} />}
      <RetentionBlock item={detail ?? item} onRetention={onRetention} />
    </>
  );
}

function Person({ item }: { item: DialogItem | DialogDetail }) {
  const who = item.counterpart;
  const calls = item.calls_count;
  if (who.type === "specialist") {
    return (
      <div className={s.person}>
        <SpecialistPhoto url={who.photo_url ?? null} name={who.name} size={96} alt={`Фото: ${who.name}`} />
        <div>
          <div className={s.personName}>{who.name}</div>
          <div className={s.personSub}>
            Психолог{who.experience_years ? `, опыт ${who.experience_years} ${plural(who.experience_years, "год", "года", "лет")}` : ""}
          </div>
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
          <Button variant="ghost" size="sm" href={`/app/specialists/${who.psychologist_id}`}>
            Открыть профиль
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className={s.person}>
      <AvatarThumb config={who.avatar_config} seed={who.name} size={96} />
      <div>
        <div className={s.personName}>{who.name}</div>
        <div className={s.personSub}>
          Анонимный клиент{calls ? `, ${calls} ${plural(calls, "созвон", "созвона", "созвонов")}` : ""}
        </div>
      </div>
    </div>
  );
}

function NextCall({ detail }: { detail: DialogDetail | null }) {
  const ctx = useDialogActions();
  const now = useNow(1000);
  const call = detail?.next_call as CallInfo | null | undefined;
  const role = detail?.my_role;

  if (!detail) return null;
  if (!call) {
    return (
      <div className={s.emptyCall}>
        <strong>Созвон не назначен</strong>
        <span>
          {role === "specialist"
            ? "Предложите клиенту время из своего расписания — он примет его одной кнопкой."
            : "Выберите удобное время из расписания специалиста. Писать можно и без созвона."}
        </span>
        {ctx && (
          <Button
            variant="primary"
            icon={<CalendarPlus size={18} strokeWidth={1.8} />}
            onClick={role === "specialist" ? ctx.openPropose : ctx.openBook}
            disabled={role === "client" && !detail.can_book}
          >
            {role === "specialist" ? "Предложить время" : "Назначить созвон"}
          </Button>
        )}
      </div>
    );
  }

  const live = isLive(call);
  const rules = detail.rules;
  return (
    <section className={s.nextCall} aria-label="Ближайший созвон">
      <div className={s.nextKicker}>
        <span>{live ? "Созвон идёт" : "Ближайший созвон"}</span>
        <span className={s.countdown}>
          <Clock3 size={14} strokeWidth={2} aria-hidden />
          {live ? (call.can_join ? "можно входить" : "идёт") : countdown(call.scheduled_at, call.duration_minutes, now)}
        </span>
      </div>
      <div>
        <div className={s.nextWhen}>
          {weekdayDay(call.scheduled_at)}, {hm(call.scheduled_at)}
        </div>
        <div className={s.nextMeta}>
          {range(call.scheduled_at, call.duration_minutes)}, {durationLabel(call.duration_minutes)}, {rub(call.amount_rub)}
          {call.status === "awaiting_payment" ? ", ждёт оплаты" : ""}
        </div>
      </div>
      {call.status === "awaiting_payment" && role === "client" ? (
        ctx ? (
          <Button variant="white" onClick={() => ctx.openPay(call)}>
            Оплатить {rub(call.amount_rub)}
          </Button>
        ) : (
          <PayCall sessionId={call.id} amountRub={call.amount_rub} paymentUrl={call.payment_url} tone="white" onPaid={() => undefined} />
        )
      ) : (
        <div className={s.nextActions}>
          <Button
            variant="white"
            href={call.can_join ? `/room/${call.id}` : undefined}
            disabled={!call.can_join}
            icon={<Video size={18} strokeWidth={1.8} />}
          >
            Присоединиться
          </Button>
        </div>
      )}
      {!call.can_join && !live && (
        <span className={s.rule}>Кнопка станет активной за 10 минут до начала.</span>
      )}
      {ctx && (call.can_reschedule || call.can_cancel) && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {call.can_reschedule && (
            <button type="button" className={s.linkBtn} onClick={() => ctx.openReschedule(call)}>
              Перенести
            </button>
          )}
          {call.can_cancel && (
            <button type="button" className={s.linkBtn} onClick={() => ctx.openCancel(call)}>
              Отменить
            </button>
          )}
        </div>
      )}
      {role === "client" && !live && (
        <span className={s.rule}>
          Бесплатно отменить или перенести можно за {rules.free_cancel_hours} ч до начала.
        </span>
      )}
    </section>
  );
}

function Proposals({ detail }: { detail: DialogDetail }) {
  const ctx = useDialogActions();
  const pending = detail.proposals.filter((p) => p.status === "pending");
  if (!pending.length) return null;
  return (
    <section className={s.section}>
      <div className={s.sectionTitle}>
        {detail.my_role === "specialist" ? "Предложенное время" : "Специалист предлагает"}
      </div>
      {pending.map((p) => (
        <div key={p.id} className={s.proposal}>
          <Sparkles size={16} strokeWidth={1.8} aria-hidden />
          <span>
            {weekdayDay(p.scheduled_at)}, {range(p.scheduled_at, p.duration_minutes)}
          </span>
          {ctx &&
            (detail.my_role === "client" ? (
              <Button size="sm" variant="primary" loading={ctx.busy === p.id} onClick={() => ctx.accept(p)}>
                Принять
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={ctx.busy === p.id} onClick={() => ctx.closeProposal(p)}>
                Отозвать
              </Button>
            ))}
        </div>
      ))}
    </section>
  );
}

function History({ detail }: { detail: DialogDetail }) {
  const ctx = useDialogActions();
  const past = detail.calls.filter((c) => c.id !== detail.next_call?.id);
  return (
    <section className={s.section}>
      <div className={s.sectionTitle}>
        <span>История созвонов</span>
        {ctx && detail.next_call && (
          <Button
            size="sm"
            variant="ghost"
            icon={<CalendarPlus size={16} strokeWidth={1.8} />}
            onClick={detail.my_role === "specialist" ? ctx.openPropose : ctx.openBook}
          >
            {detail.my_role === "specialist" ? "Предложить" : "Ещё созвон"}
          </Button>
        )}
      </div>
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
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  const save = async (value: string) => {
    setState("saving");
    try {
      await dialogsApi.saveNote(id, value);
      if (latest.current === value) setState("saved");
    } catch (e) {
      setState("error");
      void (e instanceof ApiError);
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
          timer.current = setTimeout(() => save(v), 900);
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

function RetentionBlock({ item, onRetention }: { item: DialogItem | DialogDetail; onRetention: (r: Retention) => void }) {
  const canChange = "conversation" in item ? item.conversation.can_change_retention : item.my_role === "client";
  return (
    <section className={s.section}>
      <div className={s.sectionTitle}>Хранение сообщений</div>
      {canChange ? (
        <Segmented<Retention>
          ariaLabel="Хранение сообщений"
          value={item.retention}
          onChange={onRetention}
          options={[
            { value: "forever", label: "Бессрочно" },
            { value: "24h", label: "24 часа" },
          ]}
        />
      ) : (
        <p className={s.muted}>
          <Timer size={14} strokeWidth={1.8} aria-hidden style={{ verticalAlign: -2 }} />{" "}
          {item.retention === "24h" ? "Новые сообщения удаляются через 24 часа." : "Сообщения хранятся бессрочно."} Режим
          выбирает клиент.
        </p>
      )}
      <p className={s.muted}>
        Переписка зашифрована. Сотрудники платформы не имеют доступа к диалогам клиентов и специалистов.
      </p>
    </section>
  );
}

function PinnedInfo({ item, onClose, onRetention }: { item: DialogItem; onClose: () => void; onRetention: (r: Retention) => void }) {
  const isAI = item.kind === "ai";
  return (
    <>
      <div className={s.infoHead}>
        <span className={s.infoHeadTitle}>{isAI ? "О Тише" : "О поддержке"}</span>
        <Button variant="ghost" size="sm" iconOnly className={s.infoClose} aria-label="Закрыть" onClick={onClose} icon={<X size={18} />} />
      </div>
      <div className={s.person}>
        {isAI ? (
          <Tisha size={96} state="idle" />
        ) : (
          <span className={s.rowIcon} style={{ width: 96, height: 96, borderRadius: "50%" }}>
            <Headset size={40} strokeWidth={1.6} />
          </span>
        )}
        <div>
          <div className={s.personName}>{item.counterpart.name}</div>
          <div className={s.personSub}>{isAI ? "ИИ-помощник, не психолог" : "Отвечаем в течение нескольких часов"}</div>
        </div>
      </div>
      <p className={s.muted}>
        {isAI
          ? "Тиша поможет разобраться в чувствах, подскажет практику или поможет подготовиться к созвону. Если вам плохо прямо сейчас, звоните 112."
          : "Вопросы об оплате, созвонах и работе сервиса. Сотрудники поддержки видят только обращения сюда, но не ваши диалоги со специалистами."}
      </p>
      {item.conversation_id && <RetentionBlock item={item} onRetention={onRetention} />}
      {!isAI && (
        <Link href="/legal/privacy" className={s.muted}>
          Политика конфиденциальности
        </Link>
      )}
    </>
  );
}

