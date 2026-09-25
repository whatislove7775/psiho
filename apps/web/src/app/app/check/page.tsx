import { redirect } from "next/navigation";

// Аватар, зеркало и приватность — одна страница с вкладками (/app/avatar)
export default function Page() {
  redirect("/app/avatar/mirror");
}
