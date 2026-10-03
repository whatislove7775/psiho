import { t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import Link from "next/link";
import s from "./consent.module.css";

/**
 * Small print under a submit button that links the documents the user accepts.
 * kind: signup (client), specialist (application), payment (balance top-up).
 */
export function ConsentNote({ kind, action }: { kind: "signup" | "specialist" | "payment"; action: string }) {
  if (kind === "payment") {
    return (
      <p className={s.note}>
        {t("Нажимая «")}{action}{t("», вы\u00a0принимаете условия")}{" "}<Link href={lp("/legal/offer")}>{t("публичной оферты")}</Link>{" "}{t("и")}{" "}
        <Link href={lp("/legal/refunds")}>{t("правила возврата")}</Link>.
      </p>
    );
  }
  return (
    <p className={s.note}>
      {t("Нажимая «")}{action}{t("», вы\u00a0принимаете")}{" "}<Link href={lp("/legal/terms")}>{t("пользовательское соглашение")}</Link>
      {kind === "specialist" && (
        <>
          , <Link href={lp("/legal/specialist-agreement")}>{t("договор со\u00a0специалистом")}</Link>
        </>
      )}{" "}
      {t("и\u00a0даёте")}{" "}<Link href={lp("/legal/personal-data")}>{t("согласие на\u00a0обработку персональных данных")}</Link>{" "}{t("в\u00a0соответствии с")}{" "}
      <Link href={lp("/legal/privacy")}>{t("политикой конфиденциальности")}</Link>.
    </p>
  );
}
