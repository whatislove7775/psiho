"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, ShieldOff, UserPlus, UserX, UserCheck } from "lucide-react";
import { Badge, Button, Card, CardHead, Input, Modal, Skeleton, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { RequirePerm, useStaff } from "@/components/admin/AdminShell";
import { ago, RoleBadge, SelectBox } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { STAFF_ROLE_LABEL, staffApi, type StaffMemberRow, type StaffMembers, type StaffRole } from "@/lib/api/staff";
import s from "@/components/admin/staff.module.css";

const ROLE_HINT: Record<StaffRole, string> = {
  owner: "Всё, включая управление администраторами.",
  admin: "Всё, кроме владельца: команда, деньги, возвраты, решения по специалистам.",
  moderator: "Жалобы, блокировки, приостановка специалистов.",
  support: "Обращения в поддержку, просмотр аккаунтов и созвонов, отмена без возврата.",
  developer: "Состояние системы и журнал действий. Без доступа к пользователям.",
  editor: "Статьи и практики.",
};

type Action = "deactivate" | "activate" | "reset-password" | "reset-2fa";

export default function Page_() {
  return (
    <RequirePerm perm="staff.view">
      <StaffPage />
    </RequirePerm>
  );
}

function StaffPage() {
  const { can, me } = useStaff();
  const toast = useToast();
  const [data, setData] = useState<StaffMembers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [secret, setSecret] = useState<{ alias: string; password: string } | null>(null);
  const [confirm, setConfirm] = useState<{ m: StaffMemberRow; a: Action } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    staffApi
      .members()
      .then(setData)
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`));
  }, []);
  useEffect(load, [load]);

  const manageable = (role: StaffRole) => !!data?.roles.find((r) => r.value === role)?.manageable;
  const canManage = can("staff.manage");

  const changeRole = async (m: StaffMemberRow, role: StaffRole) => {
    try {
      await staffApi.updateMember(m.user_id, { role });
      toast(`${m.alias}: теперь ${STAFF_ROLE_LABEL[role].toLowerCase()}`);
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const runAction = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const res = await staffApi.memberAction(confirm.m.user_id, confirm.a);
      if (res.one_time_password) setSecret({ alias: confirm.m.alias, password: res.one_time_password });
      toast(ACTIONS[confirm.a].done);
      setConfirm(null);
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Сотрудники"
        action={
          canManage ? (
            <Button variant="primary" icon={<UserPlus size={18} />} onClick={() => setInviting(true)}>
              Добавить сотрудника
            </Button>
          ) : undefined
        }
      />
      {error && <LoadError text={error} onRetry={load} />}
      <div className={s.stack}>
        <Card as="section" padded={false}>
          {!data ? (
            <div className={s.listPad}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={60} radius={16} />
              ))}
            </div>
          ) : (
            <div className={s.rows} role="list">
              {data.results.map((m) => {
                const self = m.user_id === me.user_id;
                const editable = canManage && !self && manageable(m.role);
                return (
                  <div key={m.user_id} role="listitem" className={s.memberRow} data-off={!m.is_active || undefined}>
                    <AvatarThumb config={m.avatar_config} seed={m.user_id} size={40} />
                    <span className={s.rowMain}>
                      <span className={s.rowTitle}>
                        {m.alias}
                        {self && <Badge>Вы</Badge>}
                        {!m.is_active && <Badge tone="danger">Отключён</Badge>}
                      </span>
                      <span className={s.rowSub}>
                        {m.note ? `${m.note}. ` : ""}
                        Вход: {ago(m.last_login)}
                        {m.created_by ? `. Добавил ${m.created_by}` : ""}
                      </span>
                    </span>
                    <span className={s.rowMeta}>
                      {m.totp_enabled ? (
                        <Badge tone="success">2FA</Badge>
                      ) : (
                        <Badge tone="warning">Без 2FA</Badge>
                      )}
                      {m.must_change_password && <Badge>Ждёт первого входа</Badge>}
                      {editable ? (
                        <SelectBox<StaffRole>
                          label={`Роль ${m.alias}`}
                          value={m.role}
                          onChange={(r) => changeRole(m, r)}
                          options={data.roles.filter((r) => r.manageable || r.value === m.role).map((r) => ({ value: r.value, label: r.label }))}
                        />
                      ) : (
                        <RoleBadge role={m.role} />
                      )}
                    </span>
                    {editable && (
                      <span className={s.memberActions}>
                        <Button size="sm" variant="ghost" iconOnly aria-label="Сбросить пароль" title="Сбросить пароль" icon={<KeyRound size={16} />} onClick={() => setConfirm({ m, a: "reset-password" })} />
                        {m.totp_enabled && (
                          <Button size="sm" variant="ghost" iconOnly aria-label="Сбросить 2FA" title="Сбросить 2FA" icon={<ShieldOff size={16} />} onClick={() => setConfirm({ m, a: "reset-2fa" })} />
                        )}
                        {m.is_active ? (
                          <Button size="sm" variant="ghost" iconOnly aria-label="Отключить доступ" title="Отключить доступ" icon={<UserX size={16} />} onClick={() => setConfirm({ m, a: "deactivate" })} />
                        ) : (
                          <Button size="sm" variant="ghost" iconOnly aria-label="Вернуть доступ" title="Вернуть доступ" icon={<UserCheck size={16} />} onClick={() => setConfirm({ m, a: "activate" })} />
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {data && (
          <Card as="section">
            <CardHead title="Права ролей" sub="Проверяются на сервере. Личная переписка клиентов со специалистами недоступна никому из команды." />
            <div className={s.matrixWrap}>
              <table className={s.matrix}>
                <thead>
                  <tr>
                    <th scope="col">Право</th>
                    {data.roles.map((r) => (
                      <th key={r.value} scope="col" title={ROLE_HINT[r.value]}>
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.matrix.map((row) => (
                    <tr key={row.perm}>
                      <th scope="row">{row.label}</th>
                      {data.roles.map((r) => (
                        <td key={r.value}>
                          {row.roles.includes(r.value) ? (
                            <Check size={16} aria-label="есть" className={s.yes} />
                          ) : (
                            <span className={s.no} aria-label="нет">
                              ·
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {data && (
        <InviteModal
          open={inviting}
          roles={data.roles.filter((r) => r.manageable).map((r) => r.value)}
          onClose={() => setInviting(false)}
          onCreated={(alias, password) => {
            setInviting(false);
            setSecret({ alias, password });
            load();
          }}
        />
      )}

      <Modal open={!!confirm} onClose={() => !busy && setConfirm(null)} title={confirm ? ACTIONS[confirm.a].title(confirm.m.alias) : ""}>
        {confirm && (
          <>
            <p className={s.modalText}>{ACTIONS[confirm.a].text}</p>
            <div className={s.modalActions}>
              <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
                Не менять
              </Button>
              <Button variant={confirm.a === "activate" ? "primary" : "danger"} loading={busy} onClick={runAction}>
                {ACTIONS[confirm.a].button}
              </Button>
            </div>
          </>
        )}
      </Modal>

      <SecretModal secret={secret} onClose={() => setSecret(null)} />
    </>
  );
}

const ACTIONS: Record<Action, { title: (a: string) => string; text: string; button: string; done: string }> = {
  deactivate: {
    title: (a) => `Отключить доступ для ${a}?`,
    text: "Сотрудник сразу выйдет со всех устройств и не сможет войти. Записи в журнале останутся.",
    button: "Отключить",
    done: "Доступ отключён",
  },
  activate: {
    title: (a) => `Вернуть доступ ${a}?`,
    text: "Сотрудник снова сможет войти со своим паролем и ролью.",
    button: "Вернуть доступ",
    done: "Доступ возвращён",
  },
  "reset-password": {
    title: (a) => `Сбросить пароль ${a}?`,
    text: "Текущий пароль перестанет работать, все сеансы завершатся. Вы получите одноразовый пароль, чтобы передать его сотруднику.",
    button: "Сбросить пароль",
    done: "Пароль сброшен",
  },
  "reset-2fa": {
    title: (a) => `Сбросить 2FA для ${a}?`,
    text: "Используйте, если сотрудник потерял телефон. Он войдёт по паролю и настроит защиту заново.",
    button: "Сбросить 2FA",
    done: "2FA сброшена",
  },
};

function InviteModal({
  open,
  roles,
  onClose,
  onCreated,
}: {
  open: boolean;
  roles: StaffRole[];
  onClose: () => void;
  onCreated: (alias: string, password: string) => void;
}) {
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<StaffRole>("support");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setLogin("");
      setNote("");
      setError(null);
      setRole(roles.includes("support") ? "support" : roles[0]);
    }
  }, [open, roles]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await staffApi.createMember(login.trim(), role, note.trim());
      onCreated(res.member.alias, res.one_time_password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Новый сотрудник" width={520}>
      <div className={s.form}>
        <Input
          label="Логин"
          hint="Латиница или кириллица, цифры, точка и дефис. Например, olga.support"
          value={login}
          onChange={(e) => setLogin(e.target.value.toLowerCase())}
          autoCapitalize="off"
          spellCheck={false}
          error={error ?? undefined}
        />
        <fieldset className={s.choices}>
          <legend>Роль</legend>
          {roles.map((r) => (
            <label key={r} className={s.choice}>
              <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
              <span>
                <strong>{STAFF_ROLE_LABEL[r]}</strong>
                <span className={s.muted}> {ROLE_HINT[r]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Input label="Заметка" hint="Необязательно. Например, имя или зона ответственности" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        <div className={s.modalActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy} disabled={login.trim().length < 3} onClick={submit}>
            Создать доступ
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SecretModal({ secret, onClose }: { secret: { alias: string; password: string } | null; onClose: () => void }) {
  const toast = useToast();
  const text = secret ? `Логин: ${secret.alias}\nОдноразовый пароль: ${secret.password}\nВход: ${typeof window !== "undefined" ? window.location.origin : ""}/login` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Скопировано");
    } catch {
      toast("Не получилось скопировать. Выделите текст вручную.", { error: true });
    }
  };
  return (
    <Modal open={!!secret} onClose={onClose} title="Передайте данные для входа">
      <p className={s.modalText}>
        Пароль показывается один раз. Передайте его лично или в защищённом мессенджере. При первом входе сотрудник придумает свой пароль.
      </p>
      <div className={s.secret}>
        <code>
          {secret?.alias}
          <br />
          {secret?.password}
        </code>
        <Button variant="ghost" size="sm" iconOnly aria-label="Скопировать" icon={<Copy size={16} />} onClick={copy} />
      </div>
      <div className={s.modalActions}>
        <Button variant="primary" onClick={onClose}>
          Готово, передал
        </Button>
      </div>
    </Modal>
  );
}
