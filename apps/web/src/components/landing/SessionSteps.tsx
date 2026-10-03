import { t } from "@/lib/i18n";
import s from "./landing.module.css";

const STEPS = [
  {
    get title() { return t("Только пароль"); },
    get text() { return t("Без\u00a0почты и\u00a0телефона. Имя вроде «тихий-кит-4821» придумаем мы."); },
  },
  {
    get title() { return t("Выберите специалиста"); },
    get text() { return t("Напишите ему в\u00a0чат или\u00a0сразу назначьте созвон."); },
  },
  {
    get title() { return t("Созвон с\u00a0аватаром"); },
    get text() { return t("Видео идёт напрямую и\u00a0не\u00a0записывается. Голос можно изменить."); },
  },
];

/** «Как это работает»: three steps in one row. */
export function SessionSteps() {
  return (
    <section id="how" className={`${s.wrap} ${s.section}`} aria-labelledby="how-title">
      <h2 id="how-title" className={s.kicker}>
        {t("Как\u00a0это\u00a0работает")}
      </h2>
      <ol className={s.steps}>
        {STEPS.map((st, i) => (
          <li key={st.title} className={s.step}>
            <span className={s.stepNum} aria-hidden>
              {i + 1}
            </span>
            <h3>{st.title}</h3>
            <p>{st.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
