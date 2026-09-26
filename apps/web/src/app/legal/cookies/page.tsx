import { DraftDoc } from "@/components/legal/DraftDoc";
import { legalMetadata } from "@/components/legal/meta";

export const metadata = legalMetadata("cookies");

export default function CookiesPage() {
  return (
    <DraftDoc
      slug="cookies"
      summary={
        <p>
          <strong>Коротко.</strong> Сайт хранит в браузере только то, что нужно для работы: ключи входа и выбранную тему
          оформления.
        </p>
      }
      sections={[
        {
          id: "what",
          title: "Что хранится в браузере",
          body: (
            <ul>
              <li>Ключи входа, чтобы не вводить пароль каждый раз. Кнопка выхода удаляет их с устройства.</li>
              <li>Настройки интерфейса, например светлая или тёмная тема.</li>
            </ul>
          ),
          todo: "Полный перечень cookie и записей хранилища с назначением и сроками.",
        },
        { id: "third", title: "Сторонние сервисы", todo: "Какие сторонние сервисы могут устанавливать cookie (например, при оплате)." },
        { id: "manage", title: "Как управлять cookie", body: <p>Cookie и данные сайта можно удалить в настройках браузера. После этого придётся войти заново.</p> },
        { id: "changes", title: "Изменения политики", todo: "" },
      ]}
    />
  );
}
