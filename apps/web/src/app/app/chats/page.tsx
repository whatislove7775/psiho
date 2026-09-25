import { redirect } from "next/navigation";

// Чаты стали диалогами: переписка и созвоны пары живут в одном месте.
export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const d = searchParams?.c;
  redirect(typeof d === "string" && d ? `/app/dialogs?d=${encodeURIComponent(d)}` : "/app/dialogs");
}
