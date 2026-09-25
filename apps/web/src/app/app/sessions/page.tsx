import { redirect } from "next/navigation";

// Сессий больше нет: созвоны назначаются и проходят внутри диалога.
export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const d = searchParams?.d;
  redirect(typeof d === "string" && d ? `/app/dialogs?d=${encodeURIComponent(d)}` : "/app/dialogs");
}
