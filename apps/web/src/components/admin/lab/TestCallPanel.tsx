"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, DoorClosed, ExternalLink, PhoneCall, Plus, Smile, Video } from "lucide-react";
import { Badge, Button, Card, CardHead, EmptyState, Input, Skeleton, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { labApi, labLink, type LabRole, type TestRoom } from "@/lib/api/lab";
import { normalizeAvatar } from "@/lib/avatar/schema";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { LoopbackPanel } from "./LoopbackPanel";
import { copyText, loadLabAvatar, QrCode, Switch, useNow } from "./shared";
import s from "./lab.module.css";

function left(iso: string, now: number) {
  const min = Math.max(0, Math.round((Date.parse(iso) - now) / 60000));
  if (min <= 0) return "время вышло";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `ещё ${h} ч ${m} мин` : `ещё ${m} мин`;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

const SIDES: { role: LabRole; title: string; text: string; icon: typeof Smile }[] = [
  { role: "client", title: "Как клиент", text: "Аватар вместо камеры и фильтр голоса. Так звонок видит специалист.", icon: Smile },
  { role: "psychologist", title: "Как специалист", text: "Настоящая камера и звук. Так звонок видит клиент.", icon: Video },
];

export function TestCallPanel() {
  const toast = useToast();
  const now = useNow(15000);
  const [rooms, setRooms] = useState<TestRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [useLabAvatar, setUseLabAvatar] = useState(false);
  const [labAvatar, setLabAvatar] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  const load = useCallback(() => {
    labApi
      .rooms()
      .then((r) => {
        setRooms(r.results);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    load();
    setOrigin(window.location.origin);
    const a = loadLabAvatar();
    setLabAvatar(a);
    setUseLabAvatar(!!a);
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const room = await labApi.create({
        label: label.trim(),
        client_avatar: useLabAvatar && labAvatar ? normalizeAvatar(labAvatar) : null,
      });
      setRooms((prev) => [room, ...(prev ?? [])].slice(0, 5));
      setLabel("");
      toast("Комната готова. Откройте ссылки на двух устройствах.");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось создать комнату.");
    } finally {
      setBusy(false);
    }
  };

  const close = async (room: TestRoom) => {
    try {
      await labApi.close(room.id);
      setRooms((prev) => (prev ?? []).filter((r) => r.id !== room.id));
      toast("Комната закрыта, ссылки больше не работают.");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const copy = async (room: TestRoom, role: LabRole) => {
    toast((await copyText(labLink(room, role, origin))) ? "Ссылка скопирована" : "Не получилось скопировать, выделите ссылку вручную");
  };

  const local = /^https?:\/\/(localhost|127\.|0\.0\.0\.0)/.test(origin);
  const active = (rooms ?? []).filter((r) => Date.parse(r.expires_at) > now);

  return (
    <div className={s.stack}>
      <Card as="section">
        <CardHead
          icon={<PhoneCall size={20} />}
          title="Тестовый звонок на двух устройствах"
          sub="Без записи на созвон и без оплаты. Комната живёт 2 часа, в статистику и выплаты не попадает."
        />
        <div className={s.createRow}>
          <Input
            label="Название (необязательно)"
            placeholder="Например, ноутбук и айфон"
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button variant="primary" icon={<Plus size={18} />} loading={busy} onClick={create}>
            Создать комнату
          </Button>
        </div>
        <div className={s.createOpts}>
          <Switch
            checked={useLabAvatar && !!labAvatar}
            disabled={!labAvatar}
            onChange={setUseLabAvatar}
            label="Аватар клиента из песочницы"
            hint={labAvatar ? "Сторона клиента войдёт с аватаром, выбранным во вкладке «Аватар и маска»." : "Выберите аватар во вкладке «Аватар и маска» и нажмите «Использовать в тестовом звонке»."}
          />
          {!!labAvatar && useLabAvatar && <AvatarThumb config={normalizeAvatar(labAvatar)} size={44} />}
        </div>
        {local && (
          <p className={s.notice}>
            Страница открыта на {origin}. Телефон не увидит этот адрес: для проверки на двух устройствах откройте лабораторию на aprosop.ru.
          </p>
        )}
      </Card>

      {error && <p className={s.errorText}>{error}</p>}
      {rooms === null && !error ? (
        <Skeleton height={260} radius={22} />
      ) : active.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PhoneCall size={22} />}
            title="Активных комнат нет"
            text="Создайте комнату: вы получите две ссылки, для клиента и для специалиста. Одну откройте на компьютере, вторую отсканируйте телефоном."
          />
        </Card>
      ) : (
        active.map((room) => (
          <Card as="section" key={room.id} className={s.roomCard}>
            <div className={s.roomHead}>
              <div style={{ minWidth: 0 }}>
                <div className={s.roomTitle}>{room.label || `Комната от ${clock(room.created_at)}`}</div>
                <div className={s.muted}>
                  Действует до {clock(room.expires_at)}, {left(room.expires_at, now)}
                </div>
              </div>
              <div className={s.roomHeadActions}>
                {room.has_client_avatar && <Badge tone="lilac">Свой аватар</Badge>}
                <Button variant="ghost" size="sm" icon={<DoorClosed size={16} />} onClick={() => close(room)}>
                  Закрыть
                </Button>
              </div>
            </div>
            <div className={s.sides}>
              {SIDES.map(({ role, title, text, icon: Icon }) => {
                const href = labLink(room, role, origin);
                return (
                  <div key={role} className={s.side} data-role={role}>
                    <div className={s.sideText}>
                      <div className={s.sideTitle}>
                        <span className={s.sideIcon}>
                          <Icon size={18} />
                        </span>
                        {title}
                      </div>
                      <p className={s.muted}>{text}</p>
                      <div className={s.sideActions}>
                        <Button variant="secondary" size="sm" icon={<ExternalLink size={16} />} onClick={() => window.open(href, "_blank", "noopener")}>
                          Открыть в новой вкладке
                        </Button>
                        <Button variant="ghost" size="sm" icon={<Copy size={16} />} onClick={() => copy(room, role)}>
                          Скопировать ссылку
                        </Button>
                      </div>
                    </div>
                    <div className={s.qrBox}>
                      <QrCode text={href} size={148} label={`QR-код: войти ${title.toLowerCase()}`} />
                      <span>Наведите камеру телефона</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}

      <LoopbackPanel />
    </div>
  );
}
