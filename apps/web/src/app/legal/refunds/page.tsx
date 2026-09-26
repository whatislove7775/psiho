import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";

export const metadata = legalMetadata("refunds");

export default function RefundsPage() {
  return (
    <DraftDoc
      slug="refunds"
      summary={
        <p>
          <strong>Коротко.</strong> Здесь будут собраны правила: когда деньги за созвон возвращаются на баланс и как
          вывести неиспользованный остаток.
        </p>
      }
      sections={[
        { id: "cancel-client", title: "Если созвон отменяет клиент", todo: "Сроки бесплатной отмены и удержания при поздней отмене." },
        { id: "cancel-specialist", title: "Если созвон отменяет или пропускает специалист", todo: "" },
        { id: "tech", title: "Технические проблемы во время созвона", todo: "" },
        { id: "balance", title: "Возврат остатка баланса", todo: "Способ и сроки возврата, анонимность при возврате." },
        {
          id: "how",
          title: "Как запросить возврат",
          body: (
            <p>
              Напишите на <a href="mailto:support@aprosop.ru">support@aprosop.ru</a> или в поддержку в кабинете и укажите
              имя на сервисе. Представляться не нужно.
            </p>
          ),
          todo: "Сроки рассмотрения обращений.",
        },
      ]}
    />
  );
}
