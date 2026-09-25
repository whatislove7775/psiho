"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, LogOut, ShieldCheck, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, Modal, Skeleton, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { RequirePerm, useStaff } from "@/components/admin/AdminShell";
import {
  actionLabel, ago, dateOnly, dateTime, KV, Pager, ReasonModal, RoleBadge, SearchBox, SelectBox, Toolbar, useDebounced,
} from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { staffApi, type Page, type StaffUserDetail, type StaffUserRow } from "@/lib/api/staff";
import { plural, SESSION_STATUS } from "@/lib/format";
import s from "@/components/admin/staff.module.css";
import { EmptyArt } from "@/components/illustrations";

type RoleFilter = "" | "client" | "psychologist" | "admin";
type StatusFilter = "" | "active" | "blocked";

const ROLE_LABEL: Record<string, string> = { client: "Клиент", psychologist: "Специалист", admin: "Сотрудник" };

export default function Page_() {
  return (
    <RequirePerm perm="users.view">
      <UsersPage />
    </RequirePerm>
  );
}

function UsersPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<StaffUserRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const dq = useDebounced(q);

  const load = useCallback(() => {
    setError(null);
    staffApi
      .users({ q: dq, role, status, page })
      .then(setData)
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`));
  }, [dq, role, status, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [dq, role, status]);

  return (
    <>
      <PageHeader
        title="Пользователи"
        sub="Клиенты анонимны: здесь только псевдонимы и состояние аккаунта. Ни почты, ни реальных имён консоль не показывает."
      />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Псевдоним или ID аккаунта" label="Поиск пользователя" />
        <SelectBox<RoleFilter>
          label="Тип аккаунта"
          value={role}
          onChange={setRole}
          options={[
            { value: "", label: "Все типы" },
            { value: "client", label: "Клиенты" },
            { value: "psychologist", label: "Специалисты" },
            { value: "admin", label: "Сотрудники" },
          ]}
        />
        <SelectBox<StatusFilter>
          label="Состояние"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "Любое состояние" },
            { value: "active", label: "Активные" },
            { value: "blocked", label: "Заблокированные" },
          ]}
        />
      </Toolbar>
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section" padded={false}>
        {!data ? (
          <div className={s.listPad}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={56} radius={16} />
            ))}
          </div>
        ) : data.results.length ? (
          <>
            <div className={s.rows} role="list">
              {data.results.map((u) => (
                <button key={u.id} type="button" role="listitem" className={s.rowBtn} onClick={() => setOpenId(u.id)}>
                  <AvatarThumb config={u.avatar_config} seed={u.id} size={40} />
                  <span className={s.rowMain}>
                    <span className={s.rowTitle}>
                      {u.alias}
                      {u.staff_role && <RoleBadge role={u.staff_role} />}
                    </span>
                    <span className={s.rowSub}>
                      {u.specialist ? `Специалист ${u.specialist.display_name}` : ROLE_LABEL[u.role]}, с {dateOnly(u.date_joined)}
                    </span>
                  </span>
                  <span className={s.rowMeta}>
                    <span className={s.hideSm}>{u.role === "client" ? `${u.sessions_total ?? 0} сесс.` : ""}</span>
                    {u.reports_open ? <Badge tone="warning">{u.reports_open} {plural(u.reports_open, "жалоба", "жалобы", "жалоб")}</Badge> : null}
                    {u.blocked ? <Badge tone="danger">Заблокирован</Badge> : !u.is_active ? <Badge>Отключён</Badge> : null}
                  </span>
                </button>
              ))}
            </div>
            <Pager page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun={["аккаунт", "аккаунта", "аккаунтов"]} />
          </>
        ) : (
          <EmptyState art={<EmptyArt scene="search" />}
            icon={<Users size={22} />}
            title="Никого не нашли"
            text="Проверьте псевдоним: он выглядит как «тихий-кит-4821». Можно искать и по полному ID аккаунта."
          />
        )}
      </Card>
      <UserModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </>
  );
}

function UserModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { can, me } = useStaff();
  const toast = useToast();
  const [u, setU] = useState<StaffUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"block" | "unblock" | "logout" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    staffApi
      .user(id)
      .then(setU)
      .catch((e) => setError((e as Error).message));
  }, [id]);
  useEffect(() => {
    setU(null);
    load();
  }, [load]);

  const act = async (reason: string) => {
    if (!u || !dialog) return;
    setBusy(true);
    try {
      if (dialog === "block") await staffApi.block(u.id, reason);
      if (dialog === "unblock") await staffApi.unblock(u.id, reason);
      if (dialog === "logout") await staffApi.forceLogout(u.id);
      toast(
        dialog === "block" ? `${u.alias} заблокирован` : dialog === "unblock" ? `${u.alias} разблокирован` : "Все сеансы завершены",
      );
      setDialog(null);
      load();
      onChanged();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const self = u?.id === me.user_id;

  return (
    <>
      <Modal open={!!id && !dialog} onClose={onClose} title={u?.alias ?? "Аккаунт"} width={640}>
        {error ? (
          <p className={s.errorText}>{error}</p>
        ) : !u ? (
          <Skeleton height={240} />
        ) : (
          <div className={s.detail}>
            <div className={s.detailHead}>
              <AvatarThumb config={u.avatar_config} seed={u.id} size={56} />
              <div>
                <div className={s.rowTitle}>
                  {u.alias} {u.staff_role && <RoleBadge role={u.staff_role} />}
                </div>
                <div className={s.rowSub}>{u.specialist ? `Специалист ${u.specialist.display_name}` : ROLE_LABEL[u.role]}</div>
              </div>
              {u.blocked ? <Badge tone="danger">Заблокирован</Badge> : u.is_active ? <Badge tone="success">Активен</Badge> : <Badge>Отключён</Badge>}
            </div>
            {u.blocked && (
              <div className={s.alert}>
                <Ban size={18} />
                <span>
                  Заблокирован {dateTime(u.blocked_at)}. Причина: {u.block_reason || "не указана"}
                </span>
              </div>
            )}
            <KV
              items={[
                ["ID аккаунта", <code key="id" className={s.code}>{u.id}</code>],
                ["Зарегистрирован", dateOnly(u.date_joined)],
                ["Последний вход", ago(u.last_login)],
                ["Жалобы на аккаунт", u.reports_received],
                ["Жалобы от аккаунта", u.reports_sent],
                ...(u.has_email !== undefined
                  ? ([["Почта", u.has_email ? "Указана, хранится только хеш" : "Не указана"]] as [string, string][])
                  : []),
              ]}
            />
            {u.sessions && (
              <div>
                <h4 className={s.subhead}>Последние сессии</h4>
                {u.sessions.length ? (
                  <ul className={s.miniList}>
                    {u.sessions.map((x) => (
                      <li key={x.id}>
                        <span>{dateTime(x.scheduled_at)}</span>
                        <span className={s.muted}>{u.role === "client" ? x.specialist.display_name : x.client.alias}</span>
                        <Badge tone={SESSION_STATUS[x.status]?.tone ?? "neutral"}>{SESSION_STATUS[x.status]?.label ?? x.status}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={s.muted}>Сессий не было.</p>
                )}
              </div>
            )}
            {u.history && u.history.length > 0 && (
              <div>
                <h4 className={s.subhead}>Действия команды</h4>
                <ul className={s.miniList}>
                  {u.history.map((h) => (
                    <li key={h.id}>
                      <span>{dateTime(h.at)}</span>
                      <span>{actionLabel(h.action)}</span>
                      <span className={s.muted}>{h.actor.alias}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!self && (
              <div className={s.modalActions}>
                {can("users.logout") && (
                  <Button variant="secondary" icon={<LogOut size={18} />} onClick={() => setDialog("logout")}>
                    Завершить сеансы
                  </Button>
                )}
                {can("users.block") &&
                  (u.blocked ? (
                    <Button variant="primary" icon={<ShieldCheck size={18} />} onClick={() => setDialog("unblock")}>
                      Разблокировать
                    </Button>
                  ) : (
                    <Button variant="danger" icon={<Ban size={18} />} onClick={() => setDialog("block")}>
                      Заблокировать
                    </Button>
                  ))}
              </div>
            )}
          </div>
        )}
      </Modal>
      <ReasonModal
        open={dialog === "block"}
        title={`Заблокировать ${u?.alias ?? ""}?`}
        text="Человек сразу выйдет со всех устройств и не сможет войти. Оплаченные сессии не отменяются автоматически."
        confirm="Заблокировать"
        variant="danger"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={act}
      />
      <ReasonModal
        open={dialog === "unblock"}
        title={`Разблокировать ${u?.alias ?? ""}?`}
        text="Аккаунт снова сможет входить и записываться на сессии."
        confirm="Разблокировать"
        requireReason={false}
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={act}
      />
      <Modal open={dialog === "logout"} onClose={() => !busy && setDialog(null)} title="Завершить все сеансы?">
        <p className={s.modalText}>
          {u?.alias} выйдет на всех устройствах и войдёт заново по паролю. Полезно, если есть подозрение, что аккаунтом пользуется кто-то чужой.
        </p>
        <div className={s.modalActions}>
          <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
            Не менять
          </Button>
          <Button variant="primary" loading={busy} onClick={() => act("")}>
            Завершить сеансы
          </Button>
        </div>
      </Modal>
    </>
  );
}
