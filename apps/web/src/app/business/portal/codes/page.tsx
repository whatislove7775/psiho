"use client";

import { useState } from "react";
import { Ban, Download, KeyRound, ListChecks, PlusCircle, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardHead, EmptyState, Input, Modal, Skeleton, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { EmptyArt } from "@/components/illustrations";
import { Hidden } from "@/components/business/Aggregates";
import { ApiError } from "@/lib/api/client";
import { businessApi, dateRu, monthRu, saveCodesCsv, type Batch } from "@/lib/api/business";
import { plural } from "@/lib/format";
import s from "@/components/business/business.module.css";

export default function CodesPage() {
  const toast = useToast();
  const data = useLoad(() => businessApi.codes(), []);
  const [count, setCount] = useState("20");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ batch: Batch; codes: string[] } | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState<Batch | null>(null);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await businessApi.generate(Number(count), label);
      setFresh(r);
      setLabel("");
      data.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось выпустить коды.");
    } finally {
      setBusy(false);
    }
  };

  const revokeBatch = async () => {
    if (!confirmBatch) return;
    try {
      await businessApi.revokeBatch(confirmBatch.id);
      toast("Неиспользованные коды партии больше не действуют");
      data.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Не получилось отозвать.", { error: true });
    }
    setConfirmBatch(null);
  };

  const d = data.data;
  return (
    <>
      <PageHeader
        title="Коды сотрудников"
        sub="Одноразовые коды: раздайте их сотрудникам любым удобным способом. Сотрудник активирует код в своём анонимном аккаунте."
      />
      {data.error ? (
        <ErrorBlock message={data.error} onRetry={data.reload} />
      ) : (
        <WithRail
          rail={
            <>
              <Card as="section">
                <CardHead title="Сводка" icon={<ListChecks size={18} />} />
                {!d ? (
                  <Skeleton height={80} radius={14} />
                ) : (
                  <div className={s.list}>
                    <div className={s.item}>
                      <span className={s.itemMain}>
                        <span className={s.itemSub}>Выпущено</span>
                      </span>
                      <strong>{d.codes.issued}</strong>
                    </div>
                    <div className={s.item}>
                      <span className={s.itemMain}>
                        <span className={s.itemSub}>Активировано на {dateRu(d.codes.as_of)}</span>
                      </span>
                      <strong>
                        <Hidden value={d.codes.activated} k={d.k_min} />
                      </strong>
                    </div>
                  </div>
                )}
              </Card>
              <Card as="section">
                <CardHead title="Почему без статусов" icon={<ShieldCheck size={18} />} />
                <p className={s.muted}>
                  Мы не показываем, какой именно код активирован, и обновляем счётчик раз в месяц. Иначе по коду, выданному
                  конкретному человеку, можно было бы понять, что он обратился за помощью.
                </p>
              </Card>
              <Card as="section">
                <CardHead title="Сотрудник ушёл" icon={<Ban size={18} />} />
                <p className={s.muted}>Отзовите его код: если он был активирован, программа для этого аккаунта закончится.</p>
                <div style={{ marginTop: 12 }}>
                  <Button variant="soft" onClick={() => setRevokeOpen(true)}>
                    Отозвать код
                  </Button>
                </div>
              </Card>
            </>
          }
        >
          <Card as="section">
            <CardHead title="Выпустить коды" icon={<PlusCircle size={18} />} sub="Коды покажем сразу и сохраним для повторной выгрузки" />
            <form className={s.form} onSubmit={generate}>
              <div className={s.form2}>
                <Input
                  label="Сколько кодов"
                  type="number"
                  min={1}
                  max={2000}
                  inputMode="numeric"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  error={error ?? undefined}
                />
                <Input label="Подпись для себя" placeholder="Например, «Отдел продаж, октябрь»" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
              </div>
              <div>
                <Button type="submit" variant="primary" icon={<KeyRound size={18} />} loading={busy} disabled={!Number(count)}>
                  Выпустить {Number(count) || ""} {plural(Number(count) || 0, "код", "кода", "кодов")}
                </Button>
              </div>
            </form>
          </Card>

          <Card as="section">
            <CardHead title="Партии" icon={<ListChecks size={18} />} />
            {!d ? (
              <Skeleton height={120} radius={14} />
            ) : d.batches.length === 0 ? (
              <EmptyState art={<EmptyArt scene="sparkles" />} title="Кодов пока нет" text="Выпустите первую партию — например, по одному коду на каждого сотрудника." />
            ) : (
              <div className={s.list}>
                {d.batches.map((b) => (
                  <div key={b.id} className={s.item}>
                    <span className={s.itemIcon}>
                      <KeyRound size={18} />
                    </span>
                    <span className={s.itemMain}>
                      <span className={s.itemTitle}>
                        {b.label || "Без подписи"} {b.revoked && <Badge tone="neutral">отозвана</Badge>}
                      </span>
                      <span className={s.itemSub}>
                        {b.count} {plural(b.count, "код", "кода", "кодов")}, {monthRu(b.created_month).toLowerCase()}
                      </span>
                    </span>
                    <span className={s.row}>
                      <Button variant="ghost" size="sm" icon={<Download size={16} />} onClick={() => businessApi.exportBatch(b.id).catch(() => toast("Не получилось скачать.", { error: true }))}>
                        CSV
                      </Button>
                      {!b.revoked && (
                        <Button variant="ghost" size="sm" onClick={() => setConfirmBatch(b)}>
                          Отозвать
                        </Button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </WithRail>
      )}

      <Modal open={!!fresh} onClose={() => setFresh(null)} title="Коды готовы" width={560}>
        {fresh && (
          <div className={s.form}>
            <p className={s.muted}>
              Раздайте по одному коду каждому сотруднику. Код одноразовый: после активации он привязывается к анонимному аккаунту, а
              вы этого не увидите.
            </p>
            <div className={s.codes}>
              {fresh.codes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <div className={s.row}>
              <Button variant="primary" icon={<Download size={18} />} onClick={() => saveCodesCsv(fresh.codes)}>
                Скачать CSV
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(fresh.codes.join("\n")).then(() => toast("Скопировано"));
                }}
              >
                Скопировать
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <RevokeCode open={revokeOpen} onClose={() => setRevokeOpen(false)} />

      <Modal open={!!confirmBatch} onClose={() => setConfirmBatch(null)} title="Отозвать партию?" width={460}>
        <div className={s.form}>
          <p className={s.muted}>
            Неиспользованные коды из партии «{confirmBatch?.label || "Без подписи"}» перестанут действовать. У тех, кто уже
            активировал код, программа продолжит работать.
          </p>
          <div className={s.row}>
            <Button variant="danger" onClick={revokeBatch}>
              Отозвать
            </Button>
            <Button variant="ghost" onClick={() => setConfirmBatch(null)}>
              Отмена
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function RevokeCode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await businessApi.revokeCode(code);
      toast(r.detail);
      setCode("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось отозвать код.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Отозвать код" width={460}>
      <form className={s.form} onSubmit={submit}>
        <Input
          label="Код сотрудника"
          placeholder="BIZ-XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={error ?? undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <p className={s.muted}>Ответ будет одинаковым, был код активирован или нет: так сохраняется анонимность сотрудника.</p>
        <Button type="submit" variant="danger" loading={busy} disabled={!code.trim()}>
          Отозвать
        </Button>
      </form>
    </Modal>
  );
}
