import { t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import Link from "next/link";
import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";
import { Tbd } from "@/components/legal/Placeholder";

export function generateMetadata() {
  return legalMetadata("personal-data");
}

export default function PersonalDataConsentPage() {
  return (
    <DraftDoc
      slug="personal-data"
      summary={
        <p>
          <strong>{t("Коротко.")}</strong>{" "}{t("Регистрируясь, вы\u00a0соглашаетесь, что\u00a0сервис обрабатывает минимальный набор данных, нужный для\u00a0работы: имя на\u00a0сервисе, хеш пароля, настройки аватара, диалоги и\u00a0созвоны. Почту и\u00a0телефон клиента мы\u00a0не\u00a0запрашиваем.")}
        </p>
      }
      sections={[
        {
          id: "who",
          title: t("Кому даётся согласие"),
          body: (
            <p>
              {t("Оператору:")}{" "}<Tbd what={t("наименование")} />{t(", ИНН")}{" "}<Tbd />{t(", адрес")}{" "}<Tbd />.
            </p>
          ),
        },
        {
          id: "data",
          title: t("Перечень данных"),
          body: (
            <p>
              {t("Перечень описан в")}{" "}<Link href={lp("/legal/privacy")}>{t("политике конфиденциальности")}</Link>.
            </p>
          ),
          todo: t("Точный перечень для\u00a0клиентов и\u00a0специалистов."),
        },
        { id: "purposes", title: t("Цели обработки"), todo: "" },
        { id: "actions", title: t("Действия с\u00a0данными и\u00a0способы обработки"), todo: "" },
        { id: "term", title: t("Срок действия согласия"), todo: "" },
        {
          id: "withdraw",
          title: t("Как\u00a0отозвать согласие"),
          body: (
            <p>
              {t("Удалите аккаунт в\u00a0настройках кабинета или\u00a0напишите на")}{" "}<a href="mailto:support@aprosop.ru">support@aprosop.ru</a>.
            </p>
          ),
          todo: t("Порядок и\u00a0сроки отзыва."),
        },
      ]}
    />
  );
}
