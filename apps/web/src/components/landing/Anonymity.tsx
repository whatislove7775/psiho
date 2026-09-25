import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { MaskFriend, Spot, type SpotName } from "@/components/illustrations";
import a from "./art.module.css";
import s from "./landing.module.css";

const FACTS = [
  {
    spot: "key" as SpotName,
    title: "Ни почты, ни телефона",
    text: "Вы придумываете только пароль, а имя на сервисе мы создаём сами. Если пароль забудется, доступ вернёт ключ восстановления: мы покажем его один раз и храним только в зашифрованном виде.",
  },
  {
    spot: "mask" as SpotName,
    title: "Вместо лица аватар, и он считается на вашем устройстве",
    text: "Камера распознаёт мимику прямо в браузере. Изображение с камеры никуда не отправляется: специалист получает только анимированный аватар. Голос при желании можно изменить фильтром.",
  },
  {
    spot: "direct" as SpotName,
    title: "Видео идёт напрямую и не записывается",
    text: "Звонок соединяет ваш браузер с браузером специалиста по зашифрованному каналу. Наш сервер лишь помогает им найти друг друга и не получает ни видео, ни звук. Записывать нечего и некуда.",
  },
  {
    spot: "trash" as SpotName,
    title: "Удалить всё можно одной кнопкой",
    text: "В настройках есть кнопка «Удалить аккаунт». Она стирает имя, аватар, записи на сессии и историю оплат. Восстановить удалённое не сможем ни вы, ни мы.",
  },
];

export function Anonymity() {
  return (
    <section id="privacy" className={`${s.wrap} ${s.section}`} aria-labelledby="privacy-title">
      <div className={s.privacy}>
        <div className={s.privacyIntro}>
          <h2 id="privacy-title" className={s.sectionTitle}>
            Как устроена анонимность
          </h2>
          <p className={s.lead}>
            Мы не просим ничего, что могло бы вас выдать. Всё, что сервис знает о клиенте, выглядит примерно так:
          </p>
          <MaskFriend className={a.privacyArt} />
          <div className={s.aliasSample}>
            <AvatarThumb config={null} seed="aprosop-kit" size={44} />
            <span>
              тихий-кит-4821
              <small>имя, пароль и настройки аватара</small>
            </span>
          </div>
        </div>
        <ul className={s.factList}>
          {FACTS.map(({ spot, title, text }) => (
            <li key={title} className={s.fact}>
              <span className={s.factIcon} aria-hidden>
                <Spot name={spot} size={48} bg={false} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
