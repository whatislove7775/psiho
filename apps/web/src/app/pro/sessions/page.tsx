import { redirect } from "next/navigation";

// Сессий больше нет: созвоны назначаются и проходят внутри диалога.
export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const d = searchParams?.d;
  redirect(typeof d === "string" && d ? `/pro/dialogs?d=${encodeURIComponent(d)}` : "/pro/dialogs");
}
