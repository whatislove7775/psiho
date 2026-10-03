"use client";

import { t, tj } from "@/lib/i18n";
import { useState } from "react";
import { Ban, Download, KeyRound, ListChecks, PlusCircle, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardHead, EmptyState, Input, Modal, NumberInput, Skeleton, useToast } from "@/ui";
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
      setError(err instanceof ApiError ? err.message : t("Не\u00a0получилось выпустить коды."));
    } finally {
      setBusy(false);
    }
  };

  const revokeBatch = async () => {
    if (!confirmBatch) return;
    try {
      await businessApi.revokeBatch(confirmBatch.id);
      toast(t("Неиспользованные коды партии больше не\u00a0действуют"));
      data.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("Не\u00a0получилось отозвать."), { error: true });
    }
    setConfirmBatch(null);
  };

  const d = data.data;
  return (
    <>
      <PageHeader
        title={t("Коды сотрудников")}
        sub={t("Одноразовые коды: раздайте их\u00a0сотрудникам любым удобным способом. Сотрудник активирует код в\u00a0своём анонимном аккаунте.")}
      />
      {data.error ? (
        <ErrorBlock message={data.error} onRetry={data.reload} />
      ) : (
        <WithRail
          rail={
            <>
              <Card as="section">
                <CardHead title={t("Сводка")} icon={<ListChecks size={18} />} />
                {!d ? (
                  <Skeleton height={80} radius={14} />
                ) : (
                  <div className={s.list}>
                    <div className={s.item}>
                      <span className={s.itemMain}>
                        <span className={s.itemSub}>{t("Выпущено")}</span>
                      </span>
                      <strong>{d.codes.issued}</strong>
                    </div>
                    <div className={s.item}>
                      <span className={s.itemMain}>
                        <span className={s.itemSub}>{tj("Активировано на {dateRu}", { dateRu: dateRu(d.codes.as_of) })}</span>
                      </span>
                      <strong>
                        <Hidden value={d.codes.activated} k={d.k_min} />
                      </strong>
                    </div>
                  </div>
                )}
              </Card>
              <Card as="section">
                <CardHead title={t("Почему без\u00a0статусов")} icon={<ShieldCheck size={18} />} />
                <p className={s.muted}>
                  {t("Мы\u00a0не\u00a0показываем, какой именно код активирован, и\u00a0обновляем счётчик раз в\u00a0месяц. Иначе по\u00a0коду, выданному конкретному человеку, можно было\u00a0бы понять, что\u00a0он\u00a0обратился за\u00a0помощью.")}
                </p>
              </Card>
              <Card as="section">
                <CardHead title={t("Сотрудник ушёл")} icon={<Ban size={18} />} />
                <p className={s.muted}>{t("Отзовите его код: если он\u00a0был активирован, программа для\u00a0этого аккаунта закончится.")}</p>
                <div style={{ marginTop: 12 }}>
                  <Button variant="soft" onClick={() => setRevokeOpen(true)}>
                    {t("Отозвать код")}
                  </Button>
                </div>
              </Card>
            </>
          }
        >
          <Card as="section">
            <CardHead title={t("Выпустить коды")} icon={<PlusCircle size={18} />} sub={t("Коды покажем сразу и\u00a0сохраним для\u00a0повторной выгрузки")} />
            <form className={s.form} onSubmit={generate}>
              <div className={s.form2}>
                <NumberInput
                  label={t("Сколько кодов")}
                  min={1}
                  max={2000}
                  value={count === "" ? null : Number(count)}
                  onChange={(v) => setCount(v == null ? "" : String(v))}
                  error={error ?? undefined}
                />
                <Input label={t("Подпись для\u00a0себя")} placeholder={t("Например, «Отдел продаж, октябрь»")} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
              </div>
              <div>
                <Button type="submit" variant="primary" icon={<KeyRound size={18} />} loading={busy} disabled={!Number(count)}>
                  {t("Выпустить")}{" "}{Number(count) || ""} {plural(Number(count) || 0, "код", "кода", "кодов")}
                </Button>
              </div>
            </form>
          </Card>

          <Card as="section">
            <CardHead title={t("Партии")} icon={<ListChecks size={18} />} />
            {!d ? (
              <Skeleton height={120} radius={14} />
            ) : d.batches.length === 0 ? (
              <EmptyState art={<EmptyArt scene="sparkles" />} title={t("Кодов пока нет")} text={t("Выпустите первую партию\u00a0— например, по\u00a0одному коду на\u00a0каждого сотрудника.")} />
            ) : (
              <div className={s.list}>
                {d.batches.map((b) => (
                  <div key={b.id} className={s.item}>
                    <span className={s.itemIcon}>
                      <KeyRound size={18} />
                    </span>
                    <span className={s.itemMain}>
                      <span className={s.itemTitle}>
                        {b.label || t("Без\u00a0подписи")} {b.revoked && <Badge tone="neutral">{t("отозвана")}</Badge>}
                      </span>
                      <span className={s.itemSub}>
                        {b.count} {plural(b.count, "код", "кода", "кодов")}, {monthRu(b.created_month).toLowerCase()}
                      </span>
                    </span>
                    <span className={s.row}>
                      <Button variant="ghost" size="sm" icon={<Download size={16} />} onClick={() => businessApi.exportBatch(b.id).catch(() => toast(t("Не\u00a0получилось скачать."), { error: true }))}>
                        CSV
                      </Button>
                      {!b.revoked && (
                        <Button variant="ghost" size="sm" onClick={() => setConfirmBatch(b)}>
                          {t("Отозвать")}
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

      <Modal open={!!fresh} onClose={() => setFresh(null)} title={t("Коды готовы")} width={560}>
        {fresh && (
          <div className={s.form}>
            <p className={s.muted}>
              {t("Раздайте по\u00a0одному коду каждому сотруднику. Код одноразовый: после активации он\u00a0привязывается к\u00a0анонимному аккаунту, а\u00a0вы\u00a0этого не\u00a0увидите.")}
            </p>
            <div className={s.codes}>
              {fresh.codes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <div className={s.row}>
              <Button variant="primary" icon={<Download size={18} />} onClick={() => saveCodesCsv(fresh.codes)}>
                {t("Скачать CSV")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(fresh.codes.join("\n")).then(() => toast(t("Скопировано")));
                }}
              >
                {t("Скопировать")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <RevokeCode open={revokeOpen} onClose={() => setRevokeOpen(false)} />

      <Modal open={!!confirmBatch} onClose={() => setConfirmBatch(null)} title={t("Отозвать партию?")} width={460}>
        <div className={s.form}>
          <p className={s.muted}>
            {t("Неиспользованные коды из\u00a0партии «")}{confirmBatch?.label || t("Без\u00a0подписи")}{t("» перестанут действовать. У\u00a0тех, кто уже активировал код, программа продолжит работать.")}
          </p>
          <div className={s.row}>
            <Button variant="danger" onClick={revokeBatch}>
              {t("Отозвать")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmBatch(null)}>
              {t("Отмена")}
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
      setError(err instanceof ApiError ? err.message : t("Не\u00a0получилось отозвать код."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t("Отозвать код")} width={460}>
      <form className={s.form} onSubmit={submit}>
        <Input
          label={t("Код сотрудника")}
          placeholder="BIZ-XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={error ?? undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <p className={s.muted}>{t("Ответ будет одинаковым, был код активирован или\u00a0нет: так сохраняется анонимность сотрудника.")}</p>
        <Button type="submit" variant="danger" loading={busy} disabled={!code.trim()}>
          {t("Отозвать")}
        </Button>
      </form>
    </Modal>
  );
}
