import s from "./landing.module.css";

const STEPS = [
  {
    title: "Только пароль",
    text: "Без почты и телефона. Имя вроде «тихий-кит-4821» придумаем мы.",
  },
  {
    title: "Выберите специалиста",
    text: "Напишите ему в чат или сразу назначьте созвон.",
  },
  {
    title: "Созвон с аватаром",
    text: "Видео идёт напрямую и не записывается. Голос можно изменить.",
  },
];

/** «Как это работает»: three steps in one row. */
export function SessionSteps() {
  return (
    <section id="how" className={`${s.wrap} ${s.section}`} aria-labelledby="how-title">
      <h2 id="how-title" className={s.kicker}>
        Как это работает
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
