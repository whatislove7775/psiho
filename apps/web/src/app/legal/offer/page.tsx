import Link from "next/link";
import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";
import { Tbd } from "@/components/legal/Placeholder";

export const metadata = legalMetadata("offer");

export default function OfferPage() {
  return (
    <DraftDoc
      slug="offer"
      summary={
        <p>
          <strong>Коротко.</strong> Вы пополняете анонимный баланс и оплачиваете с него созвоны со специалистами. Цена
          созвона видна в профиле специалиста до записи.
        </p>
      }
      sections={[
        {
          id: "general",
          title: "Общие положения",
          body: (
            <p>
              Исполнитель: <Tbd what="наименование" />. Оферта адресована любому дееспособному лицу, которое пользуется
              платными возможностями сервиса aprosop.
            </p>
          ),
          todo: "Термины, момент акцепта оферты.",
        },
        { id: "subject", title: "Предмет договора", todo: "Описание услуг: доступ к площадке, организация созвонов, баланс." },
        {
          id: "price",
          title: "Стоимость и порядок оплаты",
          body: <p>Стоимость созвона указана в профиле специалиста и зависит от длительности. Оплата списывается с баланса.</p>,
          todo: "Способы пополнения баланса, комиссии, валюта, документы об оплате.",
        },
        {
          id: "cancel",
          title: "Отмена и перенос созвона",
          body: (
            <p>
              Правила отмены и возврата описаны в <Link href="/legal/refunds">правилах возврата</Link>.
            </p>
          ),
        },
        { id: "duties", title: "Права и обязанности сторон", todo: "" },
        { id: "liability", title: "Ответственность и ограничения", todo: "Сервис не оказывает экстренную и медицинскую помощь." },
        { id: "term", title: "Срок действия и изменение оферты", todo: "" },
        { id: "details", title: "Реквизиты исполнителя", body: <p>См. страницу <Link href="/legal/requisites">«Реквизиты»</Link>.</p> },
      ]}
    />
  );
}
