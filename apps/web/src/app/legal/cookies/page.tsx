import { t } from "@/lib/i18n";
import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";

export function generateMetadata() {
  return legalMetadata("cookies");
}

export default function CookiesPage() {
  return (
    <DraftDoc
      slug="cookies"
      summary={
        <p>
          <strong>{t("Коротко.")}</strong>{" "}{t("Сайт хранит в\u00a0браузере только то, что\u00a0нужно для\u00a0работы: ключи входа, язык, страну и\u00a0тему оформления. Рекламы и\u00a0аналитики нет.")}
        </p>
      }
      sections={[
        {
          id: "what",
          title: t("Что\u00a0хранится в\u00a0браузере"),
          body: (
            <ul>
              <li>{t("Ключи входа, чтобы не\u00a0вводить пароль каждый раз. Кнопка выхода удаляет их\u00a0с\u00a0устройства.")}</li>
              <li>{t("Настройки интерфейса: язык (cookie «lang»), страна (cookie «country»), светлая или\u00a0тёмная тема.")}</li>
              <li>{t("Сторонних cookie, рекламы и\u00a0счётчиков аналитики на\u00a0сайте нет.")}</li>
            </ul>
          ),
          todo: t("Полный перечень cookie и\u00a0записей хранилища с\u00a0назначением и\u00a0сроками."),
        },
        { id: "third", title: t("Сторонние сервисы"), todo: t("Какие сторонние сервисы могут устанавливать cookie (например, при\u00a0оплате).") },
        { id: "manage", title: t("Как\u00a0управлять cookie"), body: <p>{t("Cookie и\u00a0данные сайта можно удалить в\u00a0настройках браузера. После этого придётся войти заново.")}</p> },
        { id: "changes", title: t("Изменения политики"), todo: "" },
      ]}
    />
  );
}
