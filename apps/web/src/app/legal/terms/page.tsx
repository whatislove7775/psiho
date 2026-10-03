import { t } from "@/lib/i18n";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/landing/LegalPage";
import { DRAFT_UPDATED, legalMetadata } from "@/components/legal/meta";
import { Tbd, TbdBlock } from "@/components/legal/Placeholder";

export function generateMetadata() {
  return legalMetadata("terms");
}

const SECTIONS: LegalSection[] = [
  {
    id: "parties",
    get title() { return t("Стороны и\u00a0предмет соглашения"); },
    body: (
      <>
        <p>
          Соглашение заключается между оператором сервиса (<Tbd what="наименование" />, сведения&nbsp;— на&nbsp;странице{" "}
          <Link href="/legal/requisites">«Реквизиты»</Link>) и&nbsp;пользователем сайта aprosop.ru.
        </p>
        <TbdBlock>Порядок принятия соглашения (акцепт) и&nbsp;момент его заключения.</TbdBlock>
      </>
    ),
  },
  {
    id: "what",
    get title() { return t("Что\u00a0такое Aprosop"); },
    body: (
      <>
        <p>
          Aprosop помогает найти психолога и&nbsp;общаться с&nbsp;ним анонимно в&nbsp;диалоге и&nbsp;на&nbsp;видеосозвонах. Клиент выступает под&nbsp;сгенерированным
          именем и&nbsp;3D-аватаром, специалист под&nbsp;своим именем из&nbsp;анкеты.
        </p>
        <p>
          Консультации проводят специалисты, чьи профили мы&nbsp;проверили вручную. Сервис предоставляет площадку, запись,
          оплату и&nbsp;защищённый звонок.
        </p>
      </>
    ),
  },
  {
    id: "emergency",
    get title() { return t("Это\u00a0не\u00a0экстренная помощь"); },
    body: (
      <p>
        Психологическая консультация не&nbsp;заменяет врача и&nbsp;неотложную помощь. Если вам или&nbsp;кому-то рядом угрожает
        опасность, звоните <strong>112</strong>. Детский телефон доверия <strong>8-800-2000-122</strong> работает
        бесплатно и&nbsp;круглосуточно.
      </p>
    ),
  },
  {
    id: "age",
    get title() { return t("Возраст"); },
    body: (
      <p>
        Сервис для&nbsp;взрослых. Создавая аккаунт, вы&nbsp;подтверждаете, что&nbsp;вам исполнилось 18&nbsp;лет. Если вы&nbsp;младше,
        поговорите со&nbsp;взрослым, которому доверяете, или&nbsp;позвоните на&nbsp;детский телефон доверия <strong>8-800-2000-122</strong>{" "}
        (бесплатно, круглосуточно).
      </p>
    ),
  },
  {
    id: "account",
    get title() { return t("Аккаунт клиента"); },
    body: (
      <ul>
        <li>Для&nbsp;регистрации нужен только пароль. Имя и&nbsp;ключ восстановления создаются автоматически.</li>
        <li>
          Ключ восстановления показывается один раз. Если потерять и&nbsp;пароль, и&nbsp;ключ, доступ вернуть нельзя: мы&nbsp;не&nbsp;знаем,
          кто вы, и&nbsp;не&nbsp;можем это&nbsp;проверить.
        </li>
        <li>Не&nbsp;передавайте пароль и&nbsp;ключ другим людям.</li>
        <li>Удалить аккаунт можно в&nbsp;настройках в&nbsp;любой момент.</li>
      </ul>
    ),
  },
  {
    id: "sessions",
    get title() { return t("Запись, оплата и\u00a0отмена"); },
    body: (
      <ul>
        <li>Стоимость созвона указана в&nbsp;профиле специалиста и&nbsp;видна до&nbsp;записи.</li>
        <li>Записаться можно на&nbsp;свободное время не&nbsp;раньше чем&nbsp;через час.</li>
        <li>Отменить созвон можно до&nbsp;его начала в&nbsp;диалоге со&nbsp;специалистом; бесплатно&nbsp;— не&nbsp;позднее чем&nbsp;за&nbsp;24&nbsp;часа.</li>
        <li>
          По&nbsp;вопросам возврата оплаты за&nbsp;отменённый созвон пишите на{" "}
          <a href="mailto:support@aprosop.ru">support@aprosop.ru</a> и&nbsp;укажите имя на&nbsp;сервисе.
        </li>
        <li>Войти в&nbsp;звонок можно за&nbsp;10&nbsp;минут до&nbsp;начала и&nbsp;до&nbsp;окончания созвона.</li>
      </ul>
    ),
  },
  {
    id: "conduct",
    get title() { return t("Правила для\u00a0всех участников"); },
    body: (
      <ul>
        <li>Не&nbsp;записывайте звонки и&nbsp;не&nbsp;делайте снимки экрана без&nbsp;согласия собеседника.</li>
        <li>Не&nbsp;пытайтесь узнать, кто стоит за&nbsp;аватаром, и&nbsp;не&nbsp;просите собеседника раскрыть личность.</li>
        <li>Уважительный тон. Угрозы и&nbsp;оскорбления приводят к&nbsp;блокировке аккаунта.</li>
      </ul>
    ),
  },
  {
    id: "specialists",
    get title() { return t("Для\u00a0специалистов"); },
    body: (
      <ul>
        <li>Сведения в&nbsp;анкете должны быть правдивыми. Профиль появляется в&nbsp;каталоге после ручной проверки.</li>
        <li>Мы&nbsp;можем приостановить профиль, если сведения не&nbsp;подтвердились или&nbsp;поступили обоснованные жалобы.</li>
        <li>
          Специалист соблюдает профессиональную этику и&nbsp;конфиденциальность и&nbsp;не&nbsp;пытается установить личность клиента.
        </li>
        <li>
          Регистрация: <Link href="/join">анкета специалиста</Link>.
        </li>
      </ul>
    ),
  },
  {
    id: "paid",
    get title() { return t("Платные услуги"); },
    body: (
      <p>
        Условия оплаты созвонов и&nbsp;пополнения баланса описаны в <Link href="/legal/offer">публичной оферте</Link> и{" "}
        <Link href="/legal/refunds">правилах возврата</Link>.
      </p>
    ),
  },
  { id: "liability", get title() { return t("Ответственность сторон"); }, body: <TbdBlock /> },
  { id: "disputes", get title() { return t("Порядок разрешения споров"); }, body: <TbdBlock /> },
  {
    id: "changes",
    get title() { return t("Изменения и\u00a0контакты"); },
    body: (
      <p>
        Если условия изменятся, мы&nbsp;обновим эту страницу и&nbsp;дату вверху. Как&nbsp;мы&nbsp;обращаемся с&nbsp;данными, описано на&nbsp;странице{" "}
        <Link href="/legal/privacy">о&nbsp;конфиденциальности</Link>. Вопросы присылайте на{" "}
        <a href="mailto:support@aprosop.ru">support@aprosop.ru</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      slug="terms"
      draft
      title={t("Пользовательское соглашение")}
      updated={DRAFT_UPDATED}
      summary={
        <p>
          <strong>{t("Коротко.")}</strong>{" "}{t("Вы\u00a0общаетесь с\u00a0проверенным специалистом под\u00a0анонимным именем и\u00a0аватаром. Цена видна заранее, запись можно отменить до\u00a0начала. Сервис не\u00a0заменяет экстренную помощь: в\u00a0опасной ситуации звоните 112.")}
        </p>
      }
      sections={SECTIONS}
    />
  );
}
