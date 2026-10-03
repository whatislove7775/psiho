import { t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import Link from "next/link";
import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";
import { Tbd } from "@/components/legal/Placeholder";

export function generateMetadata() {
  return legalMetadata("offer");
}

export default function OfferPage() {
  return (
    <DraftDoc
      slug="offer"
      summary={
        <p>
          <strong>{t("Коротко.")}</strong>{" "}{t("Вы\u00a0пополняете анонимный баланс и\u00a0оплачиваете с\u00a0него созвоны со\u00a0специалистами. Цена созвона видна в\u00a0профиле специалиста до\u00a0записи.")}
        </p>
      }
      sections={[
        {
          id: "general",
          title: t("Общие положения"),
          body: (
            <p>
              {t("Исполнитель:")}{" "}<Tbd what={t("наименование")} />{t(". Оферта адресована любому дееспособному лицу, которое пользуется платными возможностями сервиса Aprosop.")}
            </p>
          ),
          todo: t("Термины, момент акцепта оферты."),
        },
        { id: "subject", title: t("Предмет договора"), todo: t("Описание услуг: доступ к\u00a0площадке, организация созвонов, баланс.") },
        {
          id: "price",
          title: t("Стоимость и\u00a0порядок оплаты"),
          body: <p>{t("Стоимость созвона указана в\u00a0профиле специалиста и\u00a0зависит от\u00a0длительности. Оплата списывается с\u00a0баланса.")}</p>,
          todo: t("Способы пополнения баланса, комиссии, валюта, документы об\u00a0оплате."),
        },
        {
          id: "cancel",
          title: t("Отмена и\u00a0перенос созвона"),
          body: (
            <p>
              {t("Правила отмены и\u00a0возврата описаны в")}{" "}<Link href={lp("/legal/refunds")}>{t("правилах возврата")}</Link>.
            </p>
          ),
        },
        { id: "duties", title: t("Права и\u00a0обязанности сторон"), todo: "" },
        { id: "liability", title: t("Ответственность и\u00a0ограничения"), todo: t("Сервис не\u00a0оказывает экстренную и\u00a0медицинскую помощь.") },
        { id: "term", title: t("Срок действия и\u00a0изменение оферты"), todo: "" },
        { id: "details", title: t("Реквизиты исполнителя"), body: <p>{t("См. страницу")}{" "}<Link href={lp("/legal/requisites")}>{t("«Реквизиты»")}</Link>.</p> },
      ]}
    />
  );
}
