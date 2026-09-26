"use client";

import { Headset, Mail, UserRound } from "lucide-react";
import { Button, Card, CardHead } from "@/ui";
import { PageHeader, Stack } from "@/components/shell/AppShell";
import { usePortal } from "@/components/business/PortalGate";
import s from "@/components/business/business.module.css";

export default function SupportPage() {
  const me = usePortal();
  return (
    <>
      <PageHeader title="Поддержка" sub="Вопросы по договору, счетам, лимитам и запуску программы." />
      <Stack>
        <Card as="section">
          <CardHead title="Менеджер компании" icon={<Headset size={18} />} sub={me.support.hours} />
          <div className={s.form}>
            <p className={s.muted}>
              {me.support.manager}. Пишите по любому вопросу: подключить ещё отделы, поменять лимиты, получить закрывающие документы.
            </p>
            <div className={s.row}>
              <Button href={`mailto:${me.support.email}?subject=${encodeURIComponent(me.company.name)}`} variant="primary" icon={<Mail size={18} />}>
                {me.support.email}
              </Button>
            </div>
          </div>
        </Card>
        <Card as="section">
          <CardHead title="Ваш доступ" icon={<UserRound size={18} />} />
          <div className={s.list}>
            <div className={s.item}>
              <span className={s.itemMain}>
                <span className={s.itemSub}>Логин</span>
                <span className={s.itemTitle}>{me.admin.login}</span>
              </span>
            </div>
            {me.admin.full_name && (
              <div className={s.item}>
                <span className={s.itemMain}>
                  <span className={s.itemSub}>Имя</span>
                  <span className={s.itemTitle}>{me.admin.full_name}</span>
                </span>
              </div>
            )}
            <div className={s.item}>
              <span className={s.itemMain}>
                <span className={s.itemSub}>Компания</span>
                <span className={s.itemTitle}>{me.company.name}</span>
              </span>
            </div>
          </div>
          <p className={s.muted} style={{ marginTop: 12 }}>
            Сотрудникам, которым нужна помощь прямо сейчас: support@aprosop.ru, анонимно. Если есть угроза жизни — 112.
          </p>
        </Card>
      </Stack>
    </>
  );
}
