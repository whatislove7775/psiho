"use client";

/**
 * Host: invite a co-therapist (a verified specialist) and set the earnings split.
 * The invitee accepts on their /pro/circles page. Split = share of the host's earnings per held meeting.
 */
import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Input,
  Segmented,
  useToast,
} from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { ApiError } from "@/lib/api/client";
import {
  circlesApi,
  type CircleHost,
  type OwnerCircle,
} from "@/lib/api/circles";
import s from "./circles.module.css";

const SHARES = [10, 20, 30, 40, 50] as const;

export function CohostCard({
  c,
  onChange,
}: {
  c: OwnerCircle;
  onChange: (c: OwnerCircle) => void;
}) {
  const toast = useToast();
  const inv = c.cohost_invite;
  const [q, setQ] = useState("");
  const [found, setFound] = useState<CircleHost[]>([]);
  const [share, setShare] = useState<number>(inv?.share_percent ?? 30);
  const [busy, setBusy] = useState(false);
  const closed = c.status === "finished" || c.status === "cancelled";

  useEffect(() => {
    if (inv || q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => {
      circlesApi
        .cohostCandidates(q.trim())
        .then((r) => setFound(r.results))
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, inv]);

  const run = async (fn: () => Promise<OwnerCircle>, done: string) => {
    setBusy(true);
    try {
      onChange(await fn());
      toast(done);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось.", {
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const shareControl = (
    <div>
      <div className={s.label}>Доля ко-терапевта</div>
      <Segmented<string>
        ariaLabel="Доля ко-терапевта"
        value={String(share)}
        onChange={(v) => {
          setShare(+v);
          if (inv)
            run(
              () => circlesApi.cohostShare(c.id, +v),
              `Доля: ${100 - +v}/${v}`,
            );
        }}
        options={SHARES.map((n) => ({
          value: String(n),
          label: `${100 - n}/${n}`,
        }))}
      />
      <p className={s.note} style={{ marginTop: 6 }}>
        От&nbsp;вашего заработка за&nbsp;каждую состоявшуюся встречу: вам{" "}
        {100 - share}&nbsp;%, ко-терапевту {share}&nbsp;%.
      </p>
    </div>
  );

  return (
    <Card>
      <CardHead
        title="Ко-терапевт"
        icon={<UserPlus size={18} />}
        sub="Второй ведущий: говорит и&nbsp;модерирует, но&nbsp;не&nbsp;отменяет и&nbsp;не&nbsp;завершает встречи"
      />
      {inv ? (
        <div className={s.joinBox}>
          <div className={s.cohostRow}>
            <SpecialistPhoto
              url={inv.specialist.photo_url}
              name={inv.specialist.name}
              size={44}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{inv.specialist.name}</b>
              <small>
                {inv.status === "accepted"
                  ? "Ведёт круг вместе с вами"
                  : "Ждём ответа на приглашение"}
              </small>
            </span>
            {inv.status === "invited" && (
              <Badge tone="warning">Приглашён</Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={
                inv.status === "accepted"
                  ? "Убрать ко-терапевта"
                  : "Отозвать приглашение"
              }
              disabled={busy || closed}
              onClick={() =>
                run(
                  () => circlesApi.cohostRemove(c.id),
                  inv.status === "accepted"
                    ? "Ко-терапевт больше не ведёт круг"
                    : "Приглашение отозвано",
                )
              }
              icon={<X size={16} />}
            />
          </div>
          {!closed && shareControl}
        </div>
      ) : closed ? (
        <p className={s.note}>Круг закрыт.</p>
      ) : (
        <div className={s.joinBox}>
          <Input
            label="Найти проверенного специалиста"
            placeholder="Имя"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {found.length > 0 && (
            <ul className={s.members}>
              {found.map((p) => (
                <li key={p.id}>
                  <SpecialistPhoto url={p.photo_url} name={p.name} size={36} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {p.name}
                    {p.specializations.length > 0 && (
                      <small>{p.specializations.slice(0, 2).join(", ")}</small>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy}
                    onClick={() =>
                      run(
                        () => circlesApi.cohostInvite(c.id, p.id, share),
                        `Приглашение отправлено: ${p.name}`,
                      )
                    }
                  >
                    Пригласить
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && found.length === 0 && (
            <p className={s.note}>Никого не&nbsp;нашли.</p>
          )}
          {shareControl}
        </div>
      )}
    </Card>
  );
}
