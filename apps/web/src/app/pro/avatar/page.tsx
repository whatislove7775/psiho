import { redirect } from "next/navigation";

// Specialists appear with their real photo and camera — no avatar needed.
export default function Page() {
  redirect("/pro/profile");
}
