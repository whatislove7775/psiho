import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";
import { Tbd } from "@/components/legal/Placeholder";

export const metadata = legalMetadata("requisites");

const ROWS = ["Полное наименование", "ИНН", "ОГРН / ОГРНИП", "КПП", "Юридический адрес", "Банк", "Расчётный счёт", "БИК", "Корреспондентский счёт"];

export default function RequisitesPage() {
  return (
    <DraftDoc
      slug="requisites"
      summary={
        <p>
          <strong>Сведения об операторе сервиса aprosop.</strong> Реквизиты будут опубликованы здесь, когда будут готовы
          документы. Мы не указываем данные, которые ещё не подтверждены.
        </p>
      }
      sections={[
        {
          id: "company",
          title: "Оператор сервиса",
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
          title: "Контакты",
          body: (
            <p>
              Электронная почта: <a href="mailto:support@aprosop.ru">support@aprosop.ru</a>. Почтовый адрес: <Tbd />
            </p>
          ),
        },
      ]}
    />
  );
}
