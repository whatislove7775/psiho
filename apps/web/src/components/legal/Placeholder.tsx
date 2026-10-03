import { t } from "@/lib/i18n";
import { TBD } from "./docs";
import l from "@/components/landing/legal.module.css";

/** Visibly marked gap in a legal document. Never replace with invented details. */
export function Tbd({ what }: { what?: string }) {
  return (
    <mark className={l.tbd} title={t("Текст готовится вместе с\u00a0юристом")}>
      {what ? `${what}: ` : ""}
      {t(TBD)}
    </mark>
  );
}

/** Paragraph-sized placeholder for a whole clause. */
export function TbdBlock({ children }: { children?: React.ReactNode }) {
  return (
    <p className={l.tbdBlock}>
      {children ? <>{children} </> : null}
      <Tbd />
    </p>
  );
}
