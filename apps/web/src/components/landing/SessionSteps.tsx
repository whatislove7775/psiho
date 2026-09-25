import { Button } from "@/ui";
import { Spot, type SpotName } from "@/components/illustrations";
import a from "./art.module.css";
import s from "./landing.module.css";

const STEPS = [
  {
    spot: "key" as SpotName,
    title: "Придумайте пароль",
    text: "Почта и телефон не нужны. Сохраните ключ восстановления, который мы покажем.",
  },
  {
    spot: "mask" as SpotName,
    title: "Соберите аватар",
    text: "Форма лица, причёска, очки, одежда. Поменять можно в любой момент.",
  },
  {
    spot: "specialist" as SpotName,
    title: "Выберите специалиста",
    text: "Посмотрите, с чем он работает и сколько стоит сессия, и выберите свободное время.",
  },
  {
    spot: "card" as SpotName,
    title: "Оплатите сессию",
    text: "Длительность выбираете вы: от 50 минут до 3 часов. Отменить запись можно до начала.",
  },
  {
    spot: "video" as SpotName,
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
              <span className={a.stepSpot} aria-hidden>
                <Spot name={st.spot} size={68} />
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
