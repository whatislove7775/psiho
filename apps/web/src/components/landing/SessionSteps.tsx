import { Button } from "@/ui";
import s from "./landing.module.css";

const STEPS = [
  {
    title: "Придумайте пароль",
    text: "Почта и телефон не нужны. Сохраните ключ восстановления, который мы покажем.",
  },
  {
    title: "Соберите аватар",
    text: "Форма лица, причёска, очки, одежда. Поменять можно в любой момент.",
  },
  {
    title: "Выберите специалиста",
    text: "Посмотрите, с чем он работает и сколько стоит сессия, и выберите свободное время.",
  },
  {
    title: "Оплатите сессию",
    text: "Сессия длится 50 минут. Отменить запись можно до её начала.",
  },
  {
    title: "Подключитесь к звонку",
    text: "Кнопка входа появится за 10 минут до начала. Понадобятся камера и микрофон.",
  },
];

export function SessionSteps() {
  return (
    <section id="how" className={`${s.wrap} ${s.section}`} aria-labelledby="how-title">
      <div className={s.howPanel}>
        <div className={s.howHead}>
          <div>
            <h2 id="how-title" className={s.sectionTitle}>
              Как проходит сессия
            </h2>
          </div>
          <Button href="/start" variant="primary">
            Начать анонимно
          </Button>
        </div>
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
      </div>
    </section>
  );
}
