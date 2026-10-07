import { t } from "@/lib/i18n";
import type { CircleStatus } from "@/lib/api/circles";
export function coupleStatus(status: CircleStatus): string {
  if (status === "cancelled") return t("Встреча отменена");
  if (status === "finished") return t("Встреча завершена");
  if (status === "running") return t("Встреча идёт");
  return t("Встреча назначена");
}
