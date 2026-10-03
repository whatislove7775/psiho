import { t } from "@/lib/i18n";
import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";
import { Tbd } from "@/components/legal/Placeholder";

export function generateMetadata() {
  return legalMetadata("requisites");
}

const ROWS = ["Полное наименование", "ИНН", "ОГРН / ОГРНИП", "КПП", "Юридический адрес", "Банк", "Расчётный счёт", "БИК", "Корреспондентский счёт"];

export default function RequisitesPage() {
  return (
    <DraftDoc
      slug="requisites"
      summary={
        <p>
          <strong>{t("Сведения об\u00a0операторе сервиса Aprosop.")}</strong>{" "}{t("Реквизиты будут опубликованы здесь, когда будут готовы документы. Мы\u00a0не\u00a0указываем данные, которые ещё не\u00a0подтверждены.")}
        </p>
      }
      sections={[
        {
          id: "company",
          title: t("Оператор сервиса"),
          body: (
            <dl>
              {ROWS.map((r) => (
                <div key={r} style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", padding: "6px 0" }}>
                  <dt style={{ minWidth: 220, color: "var(--c-muted)" }}>{r}</dt>
                  <dd style={{ margin: 0 }}>
                    <Tbd />
                  </dd>
                </div>
              ))}
            </dl>
          ),
        },
        {
          id: "contacts",
          title: t("Контакты"),
          body: (
            <p>
              {t("Электронная почта:")}{" "}<a href="mailto:support@aprosop.ru">support@aprosop.ru</a>{t(". Почтовый адрес:")}{" "}<Tbd />
            </p>
          ),
        },
      ]}
    />
  );
}
