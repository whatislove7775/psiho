import { t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import Link from "next/link";
import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";

export function generateMetadata() {
  return legalMetadata("specialist-agreement");
}

export default function SpecialistAgreementPage() {
  return (
    <DraftDoc
      slug="specialist-agreement"
      summary={
        <p>
          <strong>{t("Коротко.")}</strong>{" "}{t("Условия работы специалистов на\u00a0площадке: проверка анкеты, конфиденциальность клиентов, комиссия сервиса и\u00a0выплаты. Анкета\u00a0— на\u00a0странице")}{" "}<Link href={lp("/join")}>{t("«Стать специалистом»")}</Link>.
        </p>
      }
      sections={[
        { id: "parties", title: t("Стороны и\u00a0предмет договора"), todo: "" },
        {
          id: "verification",
          title: t("Проверка специалиста"),
          body: <p>{t("Профиль появляется в\u00a0каталоге только после ручной проверки образования и\u00a0опыта.")}</p>,
          todo: t("Перечень документов и\u00a0порядок проверки."),
        },
        {
          id: "confidentiality",
          title: t("Конфиденциальность клиентов"),
          body: (
            <p>
              {t("Специалист не\u00a0пытается установить личность клиента, не\u00a0записывает созвоны и\u00a0соблюдает профессиональную этику.")}
            </p>
          ),
          todo: "",
        },
        { id: "fees", title: t("Стоимость, комиссия и\u00a0выплаты"), todo: t("Размер комиссии, график и\u00a0способ выплат, налоговый статус специалиста.") },
        { id: "cancellations", title: t("Отмены и\u00a0неявки"), todo: "" },
        { id: "termination", title: t("Приостановка и\u00a0расторжение"), todo: "" },
        { id: "liability", title: t("Ответственность сторон"), todo: "" },
      ]}
    />
  );
}
