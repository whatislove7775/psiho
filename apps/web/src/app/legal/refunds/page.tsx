import { t } from "@/lib/i18n";
import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";

export function generateMetadata() {
  return legalMetadata("refunds");
}

export default function RefundsPage() {
  return (
    <DraftDoc
      slug="refunds"
      summary={
        <p>
          <strong>{t("Коротко.")}</strong>{" "}{t("Здесь будут собраны правила: когда деньги за\u00a0созвон возвращаются на\u00a0баланс и\u00a0как\u00a0вывести неиспользованный остаток.")}
        </p>
      }
      sections={[
        { id: "cancel-client", title: t("Если созвон отменяет клиент"), todo: t("Сроки бесплатной отмены и\u00a0удержания при\u00a0поздней отмене.") },
        { id: "cancel-specialist", title: t("Если созвон отменяет или\u00a0пропускает специалист"), todo: "" },
        { id: "tech", title: t("Технические проблемы во\u00a0время созвона"), todo: "" },
        { id: "balance", title: t("Возврат остатка баланса"), todo: t("Способ и\u00a0сроки возврата, анонимность при\u00a0возврате.") },
        {
          id: "how",
          title: t("Как\u00a0запросить возврат"),
          body: (
            <p>
              {t("Напишите на")}{" "}<a href="mailto:support@aprosop.ru">support@aprosop.ru</a>{" "}{t("или\u00a0в\u00a0поддержку в\u00a0кабинете и\u00a0укажите имя на\u00a0сервисе. Представляться не\u00a0нужно.")}
            </p>
          ),
          todo: t("Сроки рассмотрения обращений."),
        },
      ]}
    />
  );
}
