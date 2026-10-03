"use client";

import { t, tj } from "@/lib/i18n";
import { Headset, Mail, UserRound } from "lucide-react";
import { Button, Card, CardHead } from "@/ui";
import { PageHeader, Stack } from "@/components/shell/AppShell";
import { usePortal } from "@/components/business/PortalGate";
import s from "@/components/business/business.module.css";

export default function SupportPage() {
  const me = usePortal();
  return (
    <>
      <PageHeader title={t("Поддержка")} sub={t("Вопросы по\u00a0договору, счетам, лимитам и\u00a0запуску программы.")} />
      <Stack>
        <Card as="section">
          <CardHead title={t("Менеджер компании")} icon={<Headset size={18} />} sub={me.support.hours} />
          <div className={s.form}>
            <p className={s.muted}>
              {tj("{manager}. Пишите по\u00a0любому вопросу: подключить ещё отделы, поменять лимиты, получить закрывающие документы.", { manager: me.support.manager })}
            </p>
            <div className={s.row}>
              <Button href={`mailto:${me.support.email}?subject=${encodeURIComponent(me.company.name)}`} variant="primary" icon={<Mail size={18} />}>
                {me.support.email}
              </Button>
            </div>
          </div>
        </Card>
        <Card as="section">
          <CardHead title={t("Ваш доступ")} icon={<UserRound size={18} />} />
          <div className={s.list}>
            <div className={s.item}>
              <span className={s.itemMain}>
                <span className={s.itemSub}>{t("Логин")}</span>
                <span className={s.itemTitle}>{me.admin.login}</span>
              </span>
            </div>
            {me.admin.full_name && (
              <div className={s.item}>
                <span className={s.itemMain}>
                  <span className={s.itemSub}>{t("Имя")}</span>
                  <span className={s.itemTitle}>{me.admin.full_name}</span>
                </span>
              </div>
            )}
            <div className={s.item}>
              <span className={s.itemMain}>
                <span className={s.itemSub}>{t("Компания")}</span>
                <span className={s.itemTitle}>{me.company.name}</span>
              </span>
            </div>
          </div>
          <p className={s.muted} style={{ marginTop: 12 }}>
            {t("Сотрудникам, которым нужна помощь прямо сейчас: support@aprosop.ru, анонимно. Если есть угроза жизни\u00a0— 112.")}
          </p>
        </Card>
      </Stack>
    </>
  );
}
