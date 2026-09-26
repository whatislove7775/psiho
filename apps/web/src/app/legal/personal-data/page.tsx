import Link from "next/link";
import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";
import { Tbd } from "@/components/legal/Placeholder";

export const metadata = legalMetadata("personal-data");

export default function PersonalDataConsentPage() {
  return (
    <DraftDoc
      slug="personal-data"
      summary={
        <p>
          <strong>Коротко.</strong> Регистрируясь, вы соглашаетесь, что сервис обрабатывает минимальный набор данных,
          нужный для работы: имя на сервисе, хеш пароля, настройки аватара, диалоги и созвоны. Почту и телефон клиента мы
          не запрашиваем.
        </p>
      }
      sections={[
        {
          id: "who",
          title: "Кому даётся согласие",
          body: (
            <p>
              Оператору: <Tbd what="наименование" />, ИНН <Tbd />, адрес <Tbd />.
            </p>
          ),
        },
        {
          id: "data",
          title: "Перечень данных",
          body: (
            <p>
              Перечень описан в <Link href="/legal/privacy">политике конфиденциальности</Link>.
            </p>
          ),
          todo: "Точный перечень для клиентов и специалистов.",
        },
        { id: "purposes", title: "Цели обработки", todo: "" },
        { id: "actions", title: "Действия с данными и способы обработки", todo: "" },
        { id: "term", title: "Срок действия согласия", todo: "" },
        {
          id: "withdraw",
          title: "Как отозвать согласие",
          body: (
            <p>
              Удалите аккаунт в настройках кабинета или напишите на <a href="mailto:support@aprosop.ru">support@aprosop.ru</a>.
            </p>
          ),
          todo: "Порядок и сроки отзыва.",
        },
      ]}
    />
  );
}
