"use client";

import { t, tj } from "@/lib/i18n";
import { DoorOpen, EyeOff, Keyboard, ScanEye, Smartphone, BellOff } from "lucide-react";
import { Button, Card, CardHead, Segmented } from "@/ui";
import { usePrivacyPrefs } from "@/lib/privacy/usePrivacy";
import { EXIT_TARGETS, STEALTH_PRESETS, panicExit, type ExitTarget, type StealthPreset } from "@/lib/privacy/stealth";
import s from "./privacy.module.css";

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={s.switch} onClick={() => onChange(!checked)} />;
}

/**
 * «Незаметный режим» + «Защита от скриншотов»: the settings cards used on the
 * client privacy tab and in the specialist profile. Everything applies at once.
 */
export function PrivacySettings() {
  const [prefs, update] = usePrivacyPrefs();
  const st = prefs.stealth;
  const preset = STEALTH_PRESETS[st.preset];
  const setStealth = (patch: Partial<typeof st>) => update((p) => ({ ...p, stealth: { ...p.stealth, ...patch } }));

  return (
    <>
      <Card as="section">
        <CardHead
          title={t("Незаметный режим")}
          sub={t("Нейтральная вкладка и\u00a0быстрый выход по\u00a0двойному Esc")}
          icon={<EyeOff size={20} />}
          action={<Switch checked={st.enabled} onChange={(v) => setStealth({ enabled: v })} label={t("Незаметный режим")} />}
        />
        <details className={s.more}>
          <summary>{t("Как\u00a0это\u00a0работает")}</summary>
        <ul className={s.how}>
          <li>
            <span className={s.howIcon}>
              <img src={preset.icon} alt="" width={18} height={18} />
            </span>
            <span>
              <strong>{t("Нейтральная вкладка.")}</strong>{" "}
              <span>{tj("Вкладка браузера называется «{title}» и\u00a0получает обычный значок\u00a0— по\u00a0ней не\u00a0понять, что\u00a0это\u00a0за\u00a0сайт.", { title: preset.title })}</span>
            </span>
          </li>
          <li>
            <span className={s.howIcon}>
              <Keyboard size={17} />
            </span>
            <span>
              <strong>
                {t("Быстрый выход: дважды")}{" "}<kbd className={s.kbd}>Esc</kbd>.
              </strong>{" "}
              <span>
                {tj("Страница мгновенно сменяется нейтральным сайтом ({v}). Работает в\u00a0кабинете и\u00a0во\u00a0время звонка\u00a0— звонок при\u00a0этом завершится.", { v: EXIT_TARGETS[st.exit].label.toLowerCase() })}
              </span>
            </span>
          </li>
          <li>
            <span className={s.howIcon}>
              <Smartphone size={17} />
            </span>
            <span>
              <strong>{t("На\u00a0телефоне\u00a0— кнопка с\u00a0перечёркнутым глазом")}</strong>{" "}
              <span>{t("рядом с\u00a0нижним меню, в\u00a0открытой переписке и\u00a0в\u00a0звонке. Одно касание\u00a0— и\u00a0вы\u00a0на\u00a0другом сайте.")}</span>
            </span>
          </li>
          <li>
            <span className={s.howIcon}>
              <BellOff size={17} />
            </span>
            <span>
              <strong>{t("Никаких уведомлений.")}</strong>{" "}
              <span>{t("Мы\u00a0не\u00a0присылаем писем, СМС и\u00a0пуш-уведомлений и\u00a0не\u00a0издаём звуков\u00a0— на\u00a0экране блокировки ничего не\u00a0появится.")}</span>
            </span>
          </li>
        </ul>
          <p className={s.honestLine}>{t("Адрес сайта останется в\u00a0истории браузера\u00a0— надёжнее открывать Aprosop в\u00a0режиме инкогнито.")}</p>
        </details>

        {st.enabled && (
          <div style={{ marginTop: 16 }}>
            <div className={s.block}>
              <span className={s.blockTitle}>{t("Как\u00a0называется вкладка")}</span>
              <div className={s.presets} role="radiogroup" aria-label={t("Название и\u00a0значок вкладки")}>
                {(Object.keys(STEALTH_PRESETS) as StealthPreset[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={st.preset === k}
                    className={s.preset}
                    onClick={() => setStealth({ preset: k })}
                  >
                    <img src={STEALTH_PRESETS[k].icon} alt="" />
                    {STEALTH_PRESETS[k].title}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.block}>
              <span className={s.blockTitle}>{t("Куда уходить при\u00a0быстром выходе")}</span>
              <Segmented<ExitTarget>
                ariaLabel={t("Нейтральный сайт")}
                value={st.exit}
                onChange={(v) => setStealth({ exit: v })}
                options={(Object.keys(EXIT_TARGETS) as ExitTarget[]).map((k) => ({ value: k, label: EXIT_TARGETS[k].short ?? EXIT_TARGETS[k].label }))}
              />
            </div>
            <div className={s.rows} style={{ borderTop: "1px solid var(--c-line)", paddingTop: 14 }}>
              <div className={s.row}>
                <span className={s.rowText}>
                  <strong>{t("При\u00a0выходе\u00a0— выйти из\u00a0аккаунта")}</strong>
                  <span>{t("Стираем вход и\u00a0данные сайта в\u00a0этом браузере.")}</span>
                </span>
                <Switch checked={st.wipe} onChange={(v) => setStealth({ wipe: v })} label={t("Выйти из\u00a0аккаунта при\u00a0быстром выходе")} />
              </div>
              <div className={s.row}>
                <span className={s.rowText}>
                  <strong>{t("Запомнить в\u00a0аккаунте")}</strong>
                  <span>{t("Режим включится и\u00a0на\u00a0других устройствах.")}</span>
                </span>
                <Switch checked={prefs.sync} onChange={(v) => update((p) => ({ ...p, sync: v }))} label={t("Запомнить настройку в\u00a0аккаунте")} />
              </div>
              <div className={s.row}>
                <span className={s.rowText}>
                  <strong>{t("Проверить")}</strong>
                  <span>{t("Откроется нейтральный сайт.")}</span>
                </span>
                <Button variant="secondary" size="sm" icon={<DoorOpen size={16} />} onClick={panicExit}>
                  {t("Выйти сейчас")}
                </Button>
              </div>
            </div>
          </div>
        )}

      </Card>

      <Card as="section">
        <CardHead
          title={t("Защита от\u00a0скриншотов")}
          sub={t("Размытие и\u00a0запрет копирования в\u00a0переписках")}
          icon={<ScanEye size={20} />}
          action={
            <Switch
              checked={prefs.screen_protect}
              onChange={(v) => update((p) => ({ ...p, screen_protect: v }))}
              label={t("Защита от\u00a0скриншотов")}
            />
          }
        />
        <details className={s.more}>
          <summary>{t("Как\u00a0это\u00a0работает")}</summary>
        <ul className={s.how}>
          <li>
            <span className={s.howIcon}>
              <EyeOff size={17} />
            </span>
            <span>
              <strong>{t("Размываем переписку,")}</strong> <span>{t("когда окно или\u00a0вкладка не\u00a0активны: в\u00a0списке приложений и\u00a0при\u00a0переключении окон её\u00a0не\u00a0видно.")}</span>
            </span>
          </li>
          <li>
            <span className={s.howIcon}>
              <ScanEye size={17} />
            </span>
            <span>
              <strong>{t("Отключаем выделение, копирование и\u00a0печать")}</strong>{" "}
              <span>{t("сообщений и\u00a0добавляем едва заметный водяной знак с\u00a0вашим псевдонимом.")}</span>
            </span>
          </li>
        </ul>
          <p className={s.honestLine}>{t("Системный скриншот или\u00a0фото экрана браузер запретить не\u00a0может. Для\u00a0обеих сторон диалога\u00a0— в\u00a0меню «⋮».")}</p>
        </details>
      </Card>
    </>
  );
}
