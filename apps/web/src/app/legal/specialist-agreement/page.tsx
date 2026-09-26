import Link from "next/link";
import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";

export const metadata = legalMetadata("specialist-agreement");

export default function SpecialistAgreementPage() {
  return (
    <DraftDoc
      slug="specialist-agreement"
      summary={
        <p>
          <strong>Коротко.</strong> Условия работы специалистов на площадке: проверка анкеты, конфиденциальность клиентов,
          комиссия сервиса и выплаты. Анкета — на странице <Link href="/join">«Стать специалистом»</Link>.
        </p>
      }
      sections={[
        { id: "parties", title: "Стороны и предмет договора", todo: "" },
        {
          id: "verification",
          title: "Проверка специалиста",
          body: <p>Профиль появляется в каталоге только после ручной проверки образования и опыта.</p>,
          todo: "Перечень документов и порядок проверки.",
        },
        {
          id: "confidentiality",
          title: "Конфиденциальность клиентов",
          body: (
            <p>
              Специалист не пытается установить личность клиента, не записывает созвоны и соблюдает профессиональную
              этику.
            </p>
          ),
          todo: "",
        },
        { id: "fees", title: "Стоимость, комиссия и выплаты", todo: "Размер комиссии, график и способ выплат, налоговый статус специалиста." },
        { id: "cancellations", title: "Отмены и неявки", todo: "" },
        { id: "termination", title: "Приостановка и расторжение", todo: "" },
        { id: "liability", title: "Ответственность сторон", todo: "" },
      ]}
    />
  );
}
